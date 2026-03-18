import { vi } from 'vitest'
import { httpRequest } from 'http-request'

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
}

export const surfaceDecisionsResponse = {
    status: 'success',
    identity: { identifier: 'id', isAuthenticated: false, authType: 'anonymous', jwtClaims: {} },
    features: {},
    customer: { hasProducts: false },
    surfaceBehavior: {},
    componentsSkipped: false,
    componentBehaviors: {},
}

/**
 * Creates a mock Akamai httpResponse object with the shape expected by the worker.
 */
export function createHttpResponse({
    status = 200,
    contentType = 'text/html',
    body = '',
    json = null,
    headers = {},
} = {}) {
    const bodyStr = json !== null ? JSON.stringify(json) : body
    const allHeaders = { 'Content-Type': [json !== null ? 'application/json' : contentType], ...headers }
    return {
        status,
        body: bodyStr,
        getHeader(name) {
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

/**
 * Creates a minimal Akamai request object for testing.
 */
export function createMockRequest({
    path = '/index.html',
    scheme = 'https',
    host = 'test.example',
    method = 'GET',
    query = '',
    body = null,
    headers = {},
} = {}) {
    return { path, scheme, host, method, query, body, getHeader: (name) => headers[name.toLowerCase()] || null }
}

/**
 * Configures the httpRequest mock to handle standard origin + surface decision requests.
 */
export function mockHttpRequest({
    status = 200,
    responseBody = '<body><head></head><h1>Test</h1></body>',
    contentType = 'text/html',
    responseHeaders = {},
    surfaceDecisions = surfaceDecisionsResponse,
} = {}) {
    vi.mocked(httpRequest).mockImplementation((url) => {
        if (url.includes('/api/v1/surface-decisions')) {
            return Promise.resolve(createHttpResponse({ json: surfaceDecisions }))
        }
        if (url.includes('/api/v1/envs/') && url.includes('/endpoints/')) {
            return Promise.resolve(createHttpResponse({ body: 'response', status: 200 }))
        }
        // origin request
        const body =
            responseBody !== null && typeof responseBody === 'object'
                ? JSON.stringify(responseBody)
                : responseBody
        const ct =
            responseBody !== null && typeof responseBody === 'object' ? 'application/json' : contentType
        return Promise.resolve(
            createHttpResponse({ status, contentType: ct, body, headers: responseHeaders }),
        )
    })
}

/**
 * Reads a response body (string or ReadableStream<Uint8Array>) to a string.
 */
export async function getBodyText(body) {
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
