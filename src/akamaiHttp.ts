import { httpRequest } from 'http-request'
import type { AkamaiRequest } from './akamaiRequest'
import { isTextContentType } from './contentType'

export type AkamaiHttpResponse = {
    status: number
    body?: string | ReadableStream<Uint8Array>
    getHeader(name: string): string[] | null
    getHeaders(): Record<string, string[]>
    text(): Promise<string>
    json(): Promise<unknown>
}

/** Headers the legacy worker forwarded on origin sub-requests. */
const ORIGIN_FORWARD_HEADERS = [
    'accept',
    'accept-language',
    'cookie',
    'user-agent',
    'referer',
    'authorization',
] as const

/** Set by mos-proxy on the origin request from the viewer's host and protocol. */
const VIEWER_FORWARD_HEADERS = ['x-forwarded-host', 'x-forwarded-proto'] as const

/** Never forward these on httpRequest() sub-requests (hop-by-hop, Akamai-internal, debug). */
const SKIP_SUBREQUEST_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authentication',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
    'pragma',
    'cdn-loop',
])

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

function getHttpResponseBodyStream(httpResponse: AkamaiHttpResponse): ReadableStream<Uint8Array> | null {
    const body = httpResponse.body
    if (body && typeof body !== 'string' && typeof body.getReader === 'function') {
        return body
    }
    return null
}

export async function httpResponseToFetchResponse(httpResponse: AkamaiHttpResponse): Promise<Response> {
    const headers = new Headers()
    for (const [key, values] of Object.entries(httpResponse.getHeaders())) {
        for (const value of values) {
            headers.append(key, value)
        }
    }

    const contentType = headers.get('Content-Type')
    const bodyStream = getHttpResponseBodyStream(httpResponse)
    if (bodyStream && !isTextContentType(contentType)) {
        return new Response(bodyStream, {
            status: httpResponse.status,
            headers,
        })
    }

    const body = await readResponseBody(httpResponse)
    return new Response(body, {
        status: httpResponse.status,
        headers,
    })
}

function copyFilteredRequestHeaders(request: Request): Record<string, string[]> {
    const headers: Record<string, string[]> = {}
    request.headers.forEach((value, name) => {
        const key = name.toLowerCase()
        if (SKIP_SUBREQUEST_HEADERS.has(key) || key === 'accept-encoding') {
            return
        }
        if (!headers[key]) {
            headers[key] = []
        }
        headers[key].push(value)
    })
    headers['accept-encoding'] = ['identity']
    return headers
}

export async function buildOriginSubrequestOptions(
    akamaiRequest: AkamaiRequest,
    originRequestHeaders: Record<string, string>,
    fetchRequest: Request,
): Promise<{
    method: string
    headers: Record<string, string[]>
    body?: string
}> {
    const headers: Record<string, string[]> = {}
    const incoming = akamaiRequest.getHeaders()

    for (const name of ORIGIN_FORWARD_HEADERS) {
        const values = incoming[name]
        if (values?.length) {
            headers[name] = [...values]
        }
    }

    for (const name of VIEWER_FORWARD_HEADERS) {
        const value = fetchRequest.headers.get(name)
        if (value) {
            headers[name] = [value]
        }
    }

    for (const [name, value] of Object.entries(originRequestHeaders)) {
        headers[name.toLowerCase()] = [value]
    }

    headers['accept-encoding'] = ['identity']

    const options: { method: string; headers: Record<string, string[]>; body?: string } = {
        method: akamaiRequest.method,
        headers,
    }

    if (akamaiRequest.method !== 'GET' && akamaiRequest.method !== 'HEAD') {
        if (typeof akamaiRequest.body === 'string') {
            options.body = akamaiRequest.body
        } else {
            const body = await fetchRequest.text()
            if (body) {
                options.body = body
            }
        }
    }

    return options
}

async function buildFilteredSubrequestOptions(request: Request): Promise<{
    method: string
    headers: Record<string, string[]>
    body?: string
}> {
    const options: { method: string; headers: Record<string, string[]>; body?: string } = {
        method: request.method,
        headers: copyFilteredRequestHeaders(request),
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        const body = await request.text()
        if (body) {
            options.body = body
        }
    }

    return options
}

type HttpRequestOptionsBuilder = (request: Request) => Promise<{
    method: string
    headers: Record<string, string[]>
    body?: string
}>

export function httpRequestAsFetcher(
    rewriteUrl?: (request: Request) => string,
    buildOptions?: HttpRequestOptionsBuilder,
): (request: Request) => Promise<Response> {
    const resolveOptions = buildOptions ?? buildFilteredSubrequestOptions

    return async (request: Request) => {
        const url = rewriteUrl ? rewriteUrl(request) : request.url
        const httpResponse = (await httpRequest(url, await resolveOptions(request))) as AkamaiHttpResponse
        return httpResponseToFetchResponse(httpResponse)
    }
}
