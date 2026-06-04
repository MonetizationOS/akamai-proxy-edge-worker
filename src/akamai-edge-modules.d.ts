declare module 'http-request' {
    export function httpRequest(url: string, options?: unknown): Promise<unknown>
}

declare module 'create-response' {
    export function createResponse(
        status: number,
        headers: Record<string, string[]>,
        body: string | ReadableStream<Uint8Array>,
    ): {
        status: number
        headers: Record<string, string[]>
        body: string | ReadableStream<Uint8Array>
    }
}

declare module 'html-rewriter' {
    export interface AkamaiHtmlElement {
        getAttribute(name: string): string | null
        setAttribute(name: string, value: string): void
        removeAttribute(name: string): void
        before(content: string): void
        after(content: string): void
        prepend(content: string): void
        append(content: string): void
        replaceWith(content: string): void
        remove(): void
    }

    export class HtmlRewritingStream {
        readonly readable: ReadableStream<Uint8Array>
        readonly writable: WritableStream<Uint8Array>
        onElement(selector: string, handler: (element: AkamaiHtmlElement) => void): void
    }
}
