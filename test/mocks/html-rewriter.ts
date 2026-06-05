import { ReadableStream, WritableStream } from 'node:stream/web'
import { HTMLRewriter } from 'html-rewriter-wasm'
import type { AkamaiHtmlElement } from 'html-rewriter'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function wrapElement(handler: (element: AkamaiHtmlElement) => void) {
    return (element: {
        before: (content: string, options?: { html?: boolean }) => void
        prepend: (content: string, options?: { html?: boolean }) => void
        append: (content: string, options?: { html?: boolean }) => void
        after: (content: string, options?: { html?: boolean }) => void
        remove: () => void
        getAttribute: (name: string) => string | null
        setAttribute: (name: string, value: string) => void
        removeAttribute: (name: string) => void
    }) => {
        const htmlMode =
            (origFn: (content: string, options?: { html?: boolean }) => void) => (content: string) =>
                origFn(content, { html: true })

        const adapted: AkamaiHtmlElement = {
            getAttribute: (name) => element.getAttribute(name),
            setAttribute: (name, value) => element.setAttribute(name, value),
            removeAttribute: (name) => element.removeAttribute(name),
            before: (content) => htmlMode(element.before.bind(element))(content),
            prepend: (content) => htmlMode(element.prepend.bind(element))(content),
            append: (content) => htmlMode(element.append.bind(element))(content),
            after: (content) => htmlMode(element.after.bind(element))(content),
            replaceWith: (content) => {
                if (content) htmlMode(element.before.bind(element))(content)
                element.remove()
            },
            remove: () => element.remove(),
        }

        handler(adapted)
    }
}

export class HtmlRewritingStream {
    readonly readable: ReadableStream<Uint8Array>
    readonly writable: WritableStream<Uint8Array>
    #handlers: { selector: string; handler: (element: AkamaiHtmlElement) => void }[] = []

    constructor() {
        const handlers = this.#handlers
        const inputChunks: Uint8Array[] = []
        let outputController!: ReadableStreamDefaultController<Uint8Array>

        this.readable = new ReadableStream<Uint8Array>({
            start(controller) {
                outputController = controller
            },
        })

        this.writable = new WritableStream<Uint8Array>({
            write(chunk) {
                inputChunks.push(chunk)
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
                        // skip invalid selectors at processing time
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

    onElement(selector: string, handler: (element: AkamaiHtmlElement) => void): void {
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
