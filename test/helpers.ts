import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import { vi } from 'vitest'
import { httpRequest } from 'http-request'
import type { AkamaiRequest } from '../src/akamaiRequest'

export const testEnv = {
    ORIGIN_URL: 'https://origin.example',
    SURFACE_SLUG: 'web',
    AUTHENTICATED_USER_JWT_COOKIE_NAME: 'jwt-cookie',
    ANONYMOUS_SESSION_COOKIE_NAME: 'anon-session',
    INJECT_SCRIPT_URL: 'https://example.com/web-components-latest.js',
    MONETIZATION_OS_HOST: 'https://api.monetizationos.com',
    MONETIZATION_OS_ENDPOINTS_PREFIX: '/mos-endpoints/',
    MONETIZATION_OS_API_PATH_PREFIX: '/mos-api',
    MONETIZATION_OS_SECRET_KEY: 'sk_test_123_key.payload',
    SURFACE_DECISIONS_IGNORE_PATHS: '',
    SURFACE_DECISIONS_COOKIES: '',
}

export const surfaceDecisionsResponse: SurfaceDecisionResponse = {
    status: 'success',
    identity: { identifier: 'id', isAuthenticated: false, authType: 'anonymous', jwtClaims: {} },
    features: {},
    customer: { hasProducts: false },
    surfaceBehavior: {},
    componentsSkipped: false,
    componentBehaviors: {},
}

export type AkamaiEdgeResponse = {
    status: number
    headers: Record<string, string[]>
    body: string | ReadableStream<Uint8Array>
}

export function createHttpResponse({
    status = 200,
    contentType = 'text/html',
    body = '',
    json = null as unknown,
    headers = {},
}: {
    status?: number
    contentType?: string
    body?: string
    json?: unknown
    headers?: Record<string, string[]>
} = {}) {
    const bodyStr = json !== null ? JSON.stringify(json) : body
    const allHeaders: Record<string, string[]> = {
        'Content-Type': [json !== null ? 'application/json' : contentType],
        ...headers,
    }
    return {
        status,
        body: bodyStr,
        getHeader(name: string) {
            const lower = name.toLowerCase()
            for (const [k, v] of Object.entries(allHeaders)) {
                if (k.toLowerCase() === lower) return v
            }
            return null
        },
        getHeaders() {
            return allHeaders
        },
        async text() {
            return bodyStr
        },
        async json() {
            return json !== null ? json : JSON.parse(body)
        },
    }
}

export function createMockRequest({
    path = '/index.html',
    scheme = 'https',
    host = 'test.example',
    method = 'GET',
    query = '',
    body = null as string | null,
    headers = {} as Record<string, string[]>,
}: {
    path?: string
    scheme?: string
    host?: string
    method?: string
    query?: string
    body?: string | null
    headers?: Record<string, string[]>
} = {}): AkamaiRequest {
    const url = `${path}${query ? `?${query}` : ''}`

    return {
        path,
        scheme,
        host,
        method,
        query,
        url,
        body,
        getHeader: (name) => headers[name.toLowerCase()] ?? null,
        getHeaders: () => headers,
        getVariable: () => '',
    }
}

export function mockHttpRequest({
    status = 200,
    responseBody = '<body><head></head><h1>Test</h1></body>',
    contentType = 'text/html',
    responseHeaders = {} as Record<string, string[]>,
    surfaceDecisions = surfaceDecisionsResponse,
}: {
    status?: number
    responseBody?: string | object | null
    contentType?: string
    responseHeaders?: Record<string, string[]>
    surfaceDecisions?: SurfaceDecisionResponse
} = {}) {
    vi.mocked(httpRequest).mockImplementation((url: string) => {
        if (url.includes('/api/v1/surface-decisions')) {
            return Promise.resolve(createHttpResponse({ json: surfaceDecisions }))
        }
        if (url.includes('/api/v1/envs/') && url.includes('/endpoints/')) {
            return Promise.resolve(createHttpResponse({ body: 'response', status: 200 }))
        }

        const body =
            responseBody !== null && typeof responseBody === 'object'
                ? JSON.stringify(responseBody)
                : (responseBody as string)
        const ct =
            responseBody !== null && typeof responseBody === 'object' ? 'application/json' : contentType
        return Promise.resolve(
            createHttpResponse({ status, contentType: ct, body, headers: responseHeaders }),
        )
    })
}

export async function getBodyText(body: string | ReadableStream<Uint8Array>): Promise<string> {
    if (typeof body === 'string') return body
    const decoder = new TextDecoder()
    const reader = body.getReader()
    let text = ''
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return text
}

export function getHeaderValue(headers: Record<string, string[]>, name: string): string | null {
    const lower = name.toLowerCase()
    for (const [k, v] of Object.entries(headers || {})) {
        if (k.toLowerCase() === lower) return v[0] ?? null
    }
    return null
}

export function getHeaderValues(headers: Record<string, string[]>, name: string): string[] {
    const lower = name.toLowerCase()
    for (const [k, v] of Object.entries(headers || {})) {
        if (k.toLowerCase() === lower) return v
    }
    return []
}
