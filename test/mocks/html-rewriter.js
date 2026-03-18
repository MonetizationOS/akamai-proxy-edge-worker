import { ReadableStream, WritableStream } from 'node:stream/web'
import { HTMLRewriter } from 'html-rewriter-wasm'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Wraps a html-rewriter-wasm element to match Akamai's HtmlRewritingStream element API.
 *
 * Akamai's production runtime defaults to HTML mode. Text content is pre-escaped by the
 * caller (via escapeHtml) before being passed to element methods, then inserted as HTML.
 * html-rewriter-wasm defaults to text mode, so we force { html: true } for all content
 * insertions to match production behavior.
 *
 * Also polyfills `replaceWith(content)` which is not present in html-rewriter-wasm.
 */
function wrapElement(handler) {
    return (element) => {
        const _before = element.before.bind(element)
        const _prepend = element.prepend.bind(element)
        const _append = element.append.bind(element)
        const _after = element.after.bind(element)

        // Akamai's API is always HTML mode — force { html: true } in the wasm binding.
        const htmlMode = (origFn) => (content) => origFn(content, { html: true })

        element.before = htmlMode(_before)
        element.prepend = htmlMode(_prepend)
        element.append = htmlMode(_append)
        element.after = htmlMode(_after)

        element.replaceWith = (content) => {
            if (content) _before(content, { html: true })
            element.remove()
        }

        handler(element)
    }
}

/**
 * Node.js-compatible HtmlRewritingStream backed by html-rewriter-wasm (lol-html).
 * Implements the same TransformStream interface as Akamai's html-rewriter module
 * so tests run against the real lol-html parsing engine.
 */
export class HtmlRewritingStream {
    #handlers = []

    constructor() {
        const handlers = this.#handlers
        const inputChunks = []
        let outputController

        this.readable = new ReadableStream({
            start(controller) {
                outputController = controller
            },
        })

        this.writable = new WritableStream({
            write(chunk) {
                inputChunks.push(chunk instanceof Uint8Array ? chunk : encoder.encode(String(chunk)))
            },
            async close() {
                let output = ''
                const rewriter = new HTMLRewriter((chunk) => {
                    output += decoder.decode(chunk)
                })
                for (const { selector, handler } of handlers) {
                    try {
                        rewriter.on(selector, { element: wrapElement(handler) })
                    } catch {
                        // Skip selectors that are invalid at processing time (already validated at registration)
                    }
                }
                try {
                    for (const chunk of inputChunks) {
                        await rewriter.write(chunk)
                    }
                    await rewriter.end()
                } finally {
                    rewriter.free()
                }
                outputController.enqueue(encoder.encode(output))
                outputController.close()
            },
        })
    }

    onElement(selector, handler) {
        // Validate the selector eagerly, matching Akamai's production behavior where
        // HtmlRewritingStream throws synchronously for invalid selectors.
        const probe = new HTMLRewriter(() => {})
        try {
            probe.on(selector, { element: () => {} })
        } catch (err) {
            probe.free()
            throw err
        }
        probe.free()
        this.#handlers.push({ selector, handler })
    }
}
