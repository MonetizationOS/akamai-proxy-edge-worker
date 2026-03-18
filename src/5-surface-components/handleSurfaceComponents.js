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
    let hasSentinelHandlers = false

    for (const [componentKey, componentBehavior] of Object.entries(surfaceDecisions.componentBehaviors)) {
        if (!componentBehavior.metadata?.cssSelector || !componentBehavior.content) {
            continue
        }

        if (componentBehavior.metadata.cssSelector.includes(':last-child')) {
            continue
        }

        const selector = componentBehavior.metadata.cssSelector
        const content = componentBehavior.content

        // Register sentinel END handlers BEFORE content modification handlers so that
        // content appended by applyContentModifications (e.g. `append`) falls outside
        // the replaced range rather than being consumed by the replacement.
        if (content.replaceRange) {
            const sentinelId = `MOS_CUT_${componentKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
            // Track before the attempt so we know to clean up even on partial registration.
            hasSentinelHandlers = true
            try {
                registerSentinelHandlers(rewriter, selector, content.replaceRange, sentinelId)
                replaceRanges.push({ id: sentinelId, replaceWith: content.replaceRange.replaceWith })
                doRewrite = true
            } catch (error) {
                // replaceRange registration failed (e.g. unsupported selector in marker).
                // Some handlers may have been registered before the throw; the global
                // cleanup below will remove any orphaned sentinel comments.
            }
        }

        try {
            rewriter.onElement(selector, (element) => {
                applyContentModifications(element, content)
            })
            doRewrite = true
        } catch (error) {
            // Selector not supported by the runtime
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

    // Use the string path whenever sentinel handlers were registered (even if all
    // registrations failed) so that orphaned sentinel comments are always cleaned up.
    if (replaceRanges.length > 0 || hasSentinelHandlers) {
        let html = await streamToString(bodyStream.pipeThrough(rewriter))

        for (const { id, replaceWith } of replaceRanges) {
            const startTag = `<!--${id}_START-->`
            const endTag = `<!--${id}_END-->`
            const fallbackEndTag = `<!--${id}_FALLBACK_END-->`
            const replacement = replaceWith?.length ? replaceWith.map(renderForInsert).join('') : ''

            // Process all START/END pairs in document order (handles multiple matching elements).
            let pos = 0
            while (true) {
                const startIdx = html.indexOf(startTag, pos)
                if (startIdx === -1) break

                // Prefer the explicit END sentinel; fall back to the element-level sentinel
                // injected when a toMarker was specified but not found in the HTML.
                const explicitEndIdx = html.indexOf(endTag, startIdx)
                const fallbackEndIdx = html.indexOf(fallbackEndTag, startIdx)

                let endIdx, endLen
                if (explicitEndIdx !== -1 && (fallbackEndIdx === -1 || explicitEndIdx < fallbackEndIdx)) {
                    endIdx = explicitEndIdx
                    endLen = endTag.length
                } else if (fallbackEndIdx !== -1) {
                    endIdx = fallbackEndIdx
                    endLen = fallbackEndTag.length
                } else {
                    // Orphaned START with no END — remove it and stop scanning for this pair.
                    html = html.substring(0, startIdx) + html.substring(startIdx + startTag.length)
                    break
                }

                html = html.substring(0, startIdx) + replacement + html.substring(endIdx + endLen)
                pos = startIdx + replacement.length
            }
        }

        // Remove any remaining sentinel comments (orphaned due to failed registration
        // or markers that were never matched in the HTML).
        html = html.replace(/<!--MOS_CUT_[^>]*-->/g, '')

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

    // When from and to are identical, replacement is a no-op.
    if (fromMarker && toMarker && fromMarker === toMarker) return

    if (!fromMarker && !toMarker) {
        // Replace entire element content: inject both sentinels in a single handler
        // so each matching element gets its own matched START/END pair.
        rewriter.onElement(cssSelector, (el) => {
            el.prepend(`<!--${sentinelId}_START-->`)
            el.append(`<!--${sentinelId}_END-->`)
        })
        return
    }

    if (fromMarker) {
        registerMarkerHandler(rewriter, cssSelector, fromMarker, sentinelId, 'START', 'after')
    } else {
        rewriter.onElement(cssSelector, (el) => el.prepend(`<!--${sentinelId}_START-->`))
    }

    if (toMarker) {
        // Register a fallback END at the element level so that when toMarker is not
        // found in the HTML the entire content from START is still replaced.
        rewriter.onElement(cssSelector, (el) => el.append(`<!--${sentinelId}_FALLBACK_END-->`))
        // Register the explicit END before the marker (takes priority over fallback).
        registerMarkerHandler(rewriter, cssSelector, toMarker, sentinelId, 'END', 'before')
    } else {
        rewriter.onElement(cssSelector, (el) => el.append(`<!--${sentinelId}_END-->`))
    }
}

function registerMarkerHandler(rewriter, cssSelector, marker, sentinelId, label, insertMethod) {
    const nthChild = parseNthChildSelector(marker)
    const sentinel = `<!--${sentinelId}_${label}-->`

    if (nthChild) {
        // nth-child: count occurrences of the tag within each parent element.
        // Uses a shared counter — works correctly when there is one parent element;
        // for multiple parents the counter is cumulative, matching the first n-th child globally.
        let count = 0
        rewriter.onElement(`${cssSelector} ${nthChild.tag}`, (element) => {
            count++
            if (count === nthChild.n) {
                element[insertMethod](sentinel)
            }
        })
    } else {
        // No `done` guard: fire for every matching element so that multiple parent
        // elements each get their own sentinel (processed pairwise in post-processing).
        rewriter.onElement(`${cssSelector} ${marker}`, (element) => {
            element[insertMethod](sentinel)
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
