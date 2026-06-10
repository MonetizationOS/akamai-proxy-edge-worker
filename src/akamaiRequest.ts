export type AkamaiRequest = EW.ResponseProviderRequest & {
    /** Tests can pass a string body; production Akamai requests expose a stream. */
    body: EW.ResponseProviderRequest['body'] | string | null
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

/**
 * Relative path + query for the incoming client request.
 * Prefer Akamai's `request.url` ("/path?q=1"); fall back to path + query fields.
 */
export function getClientRelativeUrl(request: AkamaiRequest): string {
    if (typeof request.url === 'string' && request.url.startsWith('/')) {
        return request.url
    }

    const path = request.path
        ? request.path.startsWith('/')
            ? request.path
            : `/${request.path}`
        : '/'
    const query = request.query ? `?${request.query}` : ''
    return `${path}${query}`
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
        // Akamai's stream type comes from @types/akamai-edgeworkers; our runtime polyfill makes it Fetch-compatible.
        init.body = request.body as BodyInit
    }

    return new Request(url, init)
}
