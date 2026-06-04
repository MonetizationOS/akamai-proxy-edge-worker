import { httpRequest } from 'http-request'

export type AkamaiHttpResponse = {
    status: number
    body: string
    getHeader(name: string): string[] | null
    getHeaders(): Record<string, string[]>
    text(): Promise<string>
    json(): Promise<unknown>
}

/**
 * Read the full body from an httpResponse, handling both small (<128KB)
 * and large responses. Akamai's .text() method has a 128KB limit,
 * so we fall back to streaming for larger bodies.
 */
export async function readResponseBody(httpResponse: AkamaiHttpResponse): Promise<string> {
    try {
        return await httpResponse.text()
    } catch {
        const body = (httpResponse as { body?: { getReader?: () => ReadableStreamDefaultReader<Uint8Array> } }).body
        if (!body?.getReader) {
            return typeof httpResponse.body === 'string' ? httpResponse.body : ''
        }

        const reader = body.getReader()
        const chunks: Uint8Array[] = []
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
        }
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        const combined = new Uint8Array(totalLength)
        let offset = 0
        for (const chunk of chunks) {
            combined.set(chunk, offset)
            offset += chunk.length
        }
        return new TextDecoder().decode(combined)
    }
}

export async function httpResponseToFetchResponse(httpResponse: AkamaiHttpResponse): Promise<Response> {
    const headers = new Headers()
    for (const [key, values] of Object.entries(httpResponse.getHeaders())) {
        for (const value of values) {
            headers.append(key, value)
        }
    }

    const body = await readResponseBody(httpResponse)
    return new Response(body, {
        status: httpResponse.status,
        headers,
    })
}

export function buildHttpRequestOptions(request: Request): {
    method: string
    headers: Record<string, string[]>
    body?: string
} {
    const headers: Record<string, string[]> = {}
    request.headers.forEach((value, name) => {
        if (!headers[name]) {
            headers[name] = []
        }
        headers[name].push(value)
    })
    headers['Accept-Encoding'] = ['identity']

    const options: { method: string; headers: Record<string, string[]>; body?: string } = {
        method: request.method,
        headers,
    }

    return options
}

async function buildHttpRequestOptionsAsync(request: Request): Promise<{
    method: string
    headers: Record<string, string[]>
    body?: string
}> {
    const options = buildHttpRequestOptions(request)
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
        const body = await request.text()
        if (body) {
            options.body = body
        }
    }
    return options
}

export function httpRequestAsFetcher(
    rewriteUrl?: (request: Request) => string,
): (request: Request) => Promise<Response> {
    return async (request: Request) => {
        const url = rewriteUrl ? rewriteUrl(request) : request.url
        const httpResponse = (await httpRequest(url, await buildHttpRequestOptionsAsync(request))) as AkamaiHttpResponse
        return httpResponseToFetchResponse(httpResponse)
    }
}
