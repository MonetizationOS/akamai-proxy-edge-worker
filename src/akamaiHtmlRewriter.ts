import { HtmlRewritingStream, type AkamaiHtmlElement } from 'html-rewriter'
import type {
    ContentOptions,
    ElementHandlers,
    HtmlRewriterAdapter,
    HtmlRewriterSession,
    RewriterElement,
} from '@monetizationos/proxy'

export const akamaiHtmlRewriter: HtmlRewriterAdapter = {
    capabilities: { onEndTag: false, nthChild: false },
    create(): HtmlRewriterSession {
        return new AkamaiHtmlRewriterSession()
    },
}

class AkamaiHtmlRewriterSession implements HtmlRewriterSession {
    private readonly stream = new HtmlRewritingStream()

    on(selector: string, handlers: ElementHandlers): HtmlRewriterSession {
        if (handlers.element) {
            this.stream.onElement(selector, (element) => {
                handlers.element!(adaptElement(element))
            })
        }
        return this
    }

    transform(response: Response): Response {
        const headers = new Headers(response.headers)
        headers.delete('Content-Length')
        headers.delete('Content-Encoding')

        if (!response.body) {
            return new Response(null, {
                status: response.status,
                statusText: response.statusText,
                headers,
            })
        }

        return new Response(response.body.pipeThrough(this.stream), {
            status: response.status,
            statusText: response.statusText,
            headers,
        })
    }
}

function adaptElement(element: AkamaiHtmlElement): RewriterElement {
    const insert = (fn: (content: string) => void) => (content: string, options?: ContentOptions) => {
        fn(options?.html === false ? escapeHtml(content) : content)
    }

    return {
        get removed() {
            return false
        },
        get tagName() {
            return ''
        },
        getAttribute: (name) => element.getAttribute(name),
        hasAttribute: (name) => element.getAttribute(name) !== null,
        setAttribute: (name, value) => {
            element.setAttribute(name, value)
        },
        removeAttribute: (name) => {
            element.removeAttribute(name)
        },
        before: insert((content) => element.before(content)),
        after: insert((content) => element.after(content)),
        prepend: insert((content) => element.prepend(content)),
        append: insert((content) => element.append(content)),
        replace: (content, options) => {
            const value = options?.html === false ? escapeHtml(content) : content
            element.replaceWith(value)
        },
        remove: () => element.remove(),
        // Akamai's element can't drop its tags and keep its children. Only range cuts would call this,
        // and `onEndTag: false` makes mos-proxy skip them.
        removeAndKeepContent: () => {
            throw new Error('removeAndKeepContent is not supported by Akamai HtmlRewritingStream')
        },
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
