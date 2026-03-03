import { HtmlRewritingStream } from 'html-rewriter'
import { ReadableStream, WritableStream } from 'streams'
import { TextEncoderStream, TextDecoderStream } from 'text-encode-transform'
import { deleteHeader, cloneHeaders } from '../helpers'
import { renderElementForStream, escapeHtml } from './elements'

/**
 * Apply surface component behaviors to the HTML response.
 *
 * Uses Akamai's HtmlRewritingStream (lol-html engine, same as Cloudflare/Fastly).
 * Supports content modifications (prepend/append/before/after/remove) and
 * range replacement (replaceRange with fromMarker/toMarker) for paywall truncation.
 *
 * replaceRange uses a sentinel-based approach: the rewriter injects HTML comment
 * markers around the content to remove, then a post-processing step strips the
 * marked region via string replacement. nth-child selectors are handled via manual
 * element counting to avoid CSS pseudo-class support issues in the runtime.
 */
export default async function handleSurfaceComponents(response, surfaceDecisions, env) {
    if (surfaceDecisions.componentsSkipped) {
        return response
    }

    const rewriter = new HtmlRewritingStream()
    let doRewrite = false
    const replaceRanges = []

    for (const [componentKey, componentBehavior] of Object.entries(surfaceDecisions.componentBehaviors)) {
        if (!componentBehavior.metadata?.cssSelector || !componentBehavior.content) {
            continue
        }

        if (componentBehavior.metadata.cssSelector.includes(':last-child')) {
            continue
        }

        const selector = componentBehavior.metadata.cssSelector
        const content = componentBehavior.content

        try {
            rewriter.onElement(selector, (element) => {
                applyContentModifications(element, content)
            })
            doRewrite = true
        } catch (error) {
            // Selector not supported by the runtime
        }

        if (content.replaceRange) {
            try {
                const sentinelId = `MOS_CUT_${componentKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
                registerSentinelHandlers(rewriter, selector, content.replaceRange, sentinelId)
                replaceRanges.push({ id: sentinelId, replaceWith: content.replaceRange.replaceWith })
                doRewrite = true
            } catch (error) {
                // replaceRange registration failed
            }
        }
    }

    if (env.INJECT_SCRIPT_URL) {
        rewriter.onElement('head', (element) => {
            element.append(`<script src="${env.INJECT_SCRIPT_URL}" async defer></script>`)
        })
        doRewrite = true
    }

    if (!doRewrite) {
        return response
    }

    const headers = cloneHeaders(response.headers)
    deleteHeader(headers, 'Content-Length')
    deleteHeader(headers, 'Content-Encoding')

    const bodyStream = stringToStream(response.body)

    if (replaceRanges.length > 0) {
        let html = await streamToString(bodyStream.pipeThrough(rewriter))

        for (const { id, replaceWith } of replaceRanges) {
            const startTag = `<!--${id}_START-->`
            const endTag = `<!--${id}_END-->`
            const startIdx = html.indexOf(startTag)
            const endIdx = html.indexOf(endTag)

            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                const replacement = replaceWith?.length ? replaceWith.map(renderForInsert).join('') : ''
                html = html.substring(0, startIdx) + replacement + html.substring(endIdx + endTag.length)
            }
        }

        return { ...response, body: html, headers }
    }

    return { ...response, body: bodyStream.pipeThrough(rewriter), headers }
}

// ──────────────────────────────────────────────────────────────────────────────
// Sentinel-based range replacement
//
// Injects HTML comment sentinels around the region to remove. For nth-child
// selectors, uses manual element counting instead of CSS pseudo-classes to
// ensure compatibility with Akamai's HtmlRewritingStream selector engine.
// ──────────────────────────────────────────────────────────────────────────────

function registerSentinelHandlers(rewriter, cssSelector, replaceRange, sentinelId) {
    const { fromMarker, toMarker } = replaceRange

    if (!fromMarker && !toMarker) return

    if (fromMarker && toMarker && fromMarker === toMarker) {
        return
    }

    if (fromMarker) {
        registerMarkerHandler(rewriter, cssSelector, fromMarker, sentinelId, 'START', 'after')
    } else {
        rewriter.onElement(cssSelector, (el) => el.prepend(`<!--${sentinelId}_START-->`))
    }

    if (toMarker) {
        registerMarkerHandler(rewriter, cssSelector, toMarker, sentinelId, 'END', 'before')
    } else {
        rewriter.onElement(cssSelector, (el) => el.append(`<!--${sentinelId}_END-->`))
    }
}

function registerMarkerHandler(rewriter, cssSelector, marker, sentinelId, label, insertMethod) {
    const nthChild = parseNthChildSelector(marker)
    const sentinel = `<!--${sentinelId}_${label}-->`

    if (nthChild) {
        let count = 0
        let done = false
        rewriter.onElement(`${cssSelector} ${nthChild.tag}`, (element) => {
            if (done) return
            count++
            if (count === nthChild.n) {
                element[insertMethod](sentinel)
                done = true
            }
        })
    } else {
        let done = false
        rewriter.onElement(`${cssSelector} ${marker}`, (element) => {
            if (done) return
            element[insertMethod](sentinel)
            done = true
        })
    }
}

function parseNthChildSelector(selector) {
    const match = selector.match(/^(\w+):nth-child\((\d+)\)$/)
    if (!match) return null
    return { tag: match[1], n: parseInt(match[2], 10) }
}

// ──────────────────────────────────────────────────────────────────────────────
// Stream helpers
// ──────────────────────────────────────────────────────────────────────────────

function stringToStream(str) {
    const textStream = new ReadableStream({
        start(controller) {
            controller.enqueue(str)
            controller.close()
        },
    })
    return textStream.pipeThrough(new TextEncoderStream())
}

async function streamToString(byteStream) {
    const textStream = byteStream.pipeThrough(new TextDecoderStream())
    let result = ''
    await textStream.pipeTo(
        new WritableStream({
            write(chunk) {
                result += chunk
            },
        }),
    )
    return result
}

// ──────────────────────────────────────────────────────────────────────────────
// Content modifications — mirrors Cloudflare's ContentElementHandler
// ──────────────────────────────────────────────────────────────────────────────

const transformPositions = ['before', 'prepend', 'append', 'after']
const reversePositions = ['after', 'prepend']

function applyContentModifications(element, content) {
    let retainElement = false

    for (const position of transformPositions) {
        const elements = content[position]
        if (!elements?.length) continue

        const ordered = reversePositions.includes(position) ? [...elements].reverse() : elements

        for (const el of ordered) {
            const { content: c, options } = renderElementForStream(el)
            const rendered = options?.escapeHTML ? escapeHtml(c) : c
            element[position](rendered)
        }

        retainElement = true
    }

    if (content.remove) {
        if (retainElement) {
            element.replaceWith('')
        } else {
            element.remove()
        }
    }
}

function renderForInsert(item) {
    const { content, options } = renderElementForStream(item)
    return options?.escapeHTML ? escapeHtml(content) : content
}
