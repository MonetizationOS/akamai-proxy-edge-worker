export interface AkamaiRequest {
    scheme: string
    host: string
    path: string
    query: string
    method: string
    body: string | null
    getHeader(name: string): string[] | null
    /** All incoming headers (lowercase keys, string[] values). See Akamai Request Object docs. */
    getHeaders(): Record<string, string[]>
    getVariable(name: string): string
}

/** Hop-by-hop headers that must not be copied onto origin sub-requests (Akamai EW guidance). */
const SKIP_REQUEST_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authentication',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
])

export function buildPropertyBaseUrl(request: AkamaiRequest): string {
    return `${request.scheme}://${request.host}`
}

function akamaiHeadersToFetch(request: AkamaiRequest): Headers {
    const headers = new Headers()
    for (const [name, values] of Object.entries(request.getHeaders())) {
        if (SKIP_REQUEST_HEADERS.has(name.toLowerCase())) {
            continue
        }
        for (const value of values) {
            headers.append(name, value)
        }
    }
    return headers
}

export function toFetchRequest(request: AkamaiRequest): Request {
    const url = `${request.scheme}://${request.host}${request.path}${request.query ? `?${request.query}` : ''}`
    const init: RequestInit = { method: request.method, headers: akamaiHeadersToFetch(request) }
    if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body
    }

    return new Request(url, init)
}
