import { afterEach, describe, expect, it, vi } from 'vitest'
import { responseProvider } from '../src/main'
import { httpRequest } from 'http-request'
import {
    createMockRequest,
    getBodyText,
    getHeaderValue,
    getHeaderValues,
    mockHttpRequest,
    surfaceDecisionsResponse,
    testEnv,
} from './helpers'

vi.mock('../src/env', () => ({
    loadEnv: vi.fn().mockReturnValue({
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
    }),
}))

describe('MonetizationOS Proxy', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('proxies GET JSON requests', async () => {
        mockHttpRequest({ responseBody: { success: true } })

        const req = createMockRequest({ path: '/hello/world', query: 'x=1&y=two' })
        const res = await responseProvider(req)
        expect(res.status).toBe(200)
        const body = typeof res.body === 'string' ? res.body : await getBodyText(res.body)
        expect(JSON.parse(body).success).toBe(true)
    })

    it('proxies POST requests with body', async () => {
        mockHttpRequest({ responseBody: { success: true } })

        const req = createMockRequest({ path: '/api/submit', method: 'POST', body: 'payload-123' })
        const res = await responseProvider(req)
        expect(res.status).toBe(200)
        const body = typeof res.body === 'string' ? res.body : await getBodyText(res.body)
        expect(JSON.parse(body).success).toBe(true)
    })

    it('proxies mos API requests', async () => {
        mockHttpRequest()

        const req = createMockRequest({ path: '/mos-endpoints/custom-endpoint' })
        const res = await responseProvider(req)
        expect(res.status).toBe(200)
        const text = typeof res.body === 'string' ? res.body : await getBodyText(res.body)
        expect(text).toBe('response')
        expect(
            vi.mocked(httpRequest).mock.calls.some(([url]: [string]) => String(url).includes('/mos-api/api/v1/envs/')),
        ).toBe(
            true,
        )
    })

    it('fetch surface decisions for HTML responses', async () => {
        mockHttpRequest()

        const req = createMockRequest()
        const res = await responseProvider(req)
        expect(res.status).toBe(200)
    })

    it('preserves 404 origin HTTP status code for HTML responses', async () => {
        mockHttpRequest({
            status: 404,
            responseBody: '<html><body>Not Found</body></html>',
        })

        const req = createMockRequest({ path: '/missing-page.html' })
        const res = await responseProvider(req)
        expect(res.status).toBe(404)
    })

    it('does not duplicate anonymous cookie if origin already sets it', async () => {
        const originSetCookieValue = `${testEnv.ANONYMOUS_SESSION_COOKIE_NAME}=test`
        mockHttpRequest({
            responseHeaders: { 'Set-Cookie': [originSetCookieValue] },
        })

        const req = createMockRequest()
        const res = await responseProvider(req)
        const setCookies = getHeaderValues(res.headers, 'set-cookie')
        expect(setCookies.length).toBe(1)
        expect(setCookies[0]).toBe(originSetCookieValue)
    })

    it('rewrites origin header links', async () => {
        mockHttpRequest({
            responseHeaders: { Location: ['https://origin.example/redirect'] },
        })

        const req = createMockRequest()
        const res = await responseProvider(req)
        expect(res.status).toBe(200)
        expect(getHeaderValue(res.headers, 'location')).toBe('https://test.example/redirect')
    })

    it.each([
        {
            name: 'absolute https links',
            body: '<body><a href="https://origin.example/a">A</a></body>',
            includes: ['https://test.example/a'],
            excludes: ['https://origin.example/a'],
        },
        {
            name: 'absolute http links',
            body: '<body><img src="http://origin.example/img.png"></body>',
            includes: ['https://test.example/img.png'],
            excludes: ['http://origin.example/img.png'],
        },
        {
            name: 'protocol-relative links',
            body: '<body><link rel="stylesheet" href="//origin.example/styles.css"></body>',
            includes: ['https://test.example/styles.css'],
            excludes: ['//origin.example/styles.css'],
        },
        {
            name: 'multiple occurrences and other domains untouched',
            body: `<body>
                <a href="https://origin.example/x">X</a>
                <a href="//origin.example/x2">X2</a>
                <a href="https://other.example/y">Y</a>
                </body>`,
            includes: ['https://test.example/x', 'https://test.example/x2', 'https://other.example/y'],
            excludes: ['https://origin.example/x', '//origin.example/x2'],
        },
    ])('rewrites origin body links - $name', async ({ body, includes, excludes }) => {
        mockHttpRequest({ responseBody: body })

        const req = createMockRequest()
        const res = await responseProvider(req)
        expect(res.status).toBe(200)
        const text = await getBodyText(res.body)
        includes.forEach((s) => expect(text).toContain(s))
        excludes.forEach((s) => expect(text).not.toContain(s))
    })

    it.each([
        {
            name: 'body string',
            http: { body: 'DENIED' },
            assert: async (res: Awaited<ReturnType<typeof responseProvider>>) => {
                expect(res.status).toBe(200)
                const text = res.body ? await getBodyText(res.body) : ''
                expect(text).toBe('DENIED')
            },
        },
        {
            name: 'body null',
            http: { body: null },
            assert: async (res: Awaited<ReturnType<typeof responseProvider>>) => {
                expect(res.status).toBe(200)
                const text = res.body ? await getBodyText(res.body) : ''
                expect(text).toBe('')
            },
        },
        {
            name: 'set headers + cookies + status (replace)',
            http: {
                headers: { 'Content-Type': 'text/plain', 'X-Custom': '123' },
                cookies: ['session=123; Path=/', 'delicious=cookies; Path=/'],
                status: 201,
                body: 'OK',
            },
            assert: async (res: Awaited<ReturnType<typeof responseProvider>>) => {
                expect(res.status).toBe(201)
                expect(getHeaderValue(res.headers, 'content-type')).toBe('text/plain')
                expect(getHeaderValue(res.headers, 'x-custom')).toBe('123')
                const setCookies = getHeaderValues(res.headers, 'set-cookie')
                expect(setCookies).toContain('session=123; Path=/')
                expect(setCookies).toContain('delicious=cookies; Path=/')
                const text = res.body ? await getBodyText(res.body) : ''
                expect(text).toBe('OK')
            },
        },
        {
            name: 'addHeaders (modify)',
            http: { addHeaders: [{ name: 'X-Added', value: '42' }] },
            assert: async (res: Awaited<ReturnType<typeof responseProvider>>) => {
                expect(getHeaderValue(res.headers, 'x-added')).toBe('42')
                expect(getHeaderValue(res.headers, 'content-type')).toBe('text/html')
                expect(res.status).toBe(200)
                const text = await getBodyText(res.body)
                expect(text).toContain('<h1>Test</h1>')
            },
        },
        {
            name: 'removeHeaders (modify)',
            http: { removeHeaders: ['Content-Type'] },
            assert: async (res: Awaited<ReturnType<typeof responseProvider>>) => {
                expect(getHeaderValue(res.headers, 'content-type')).toBeNull()
                expect(res.status).toBe(200)
                const text = await getBodyText(res.body)
                expect(text).toContain('<h1>Test</h1>')
            },
        },
        {
            name: 'addCookies (modify)',
            http: { addCookies: ['c=3; Path=/', 'd=4; Path=/'] },
            assert: async (res: Awaited<ReturnType<typeof responseProvider>>) => {
                const setCookies = getHeaderValues(res.headers, 'set-cookie')
                expect(setCookies).toContain('c=3; Path=/')
                expect(setCookies).toContain('d=4; Path=/')
                expect(res.status).toBe(200)
                const text = await getBodyText(res.body)
                expect(text).toContain('<h1>Test</h1>')
            },
        },
        {
            name: 'status (modify)',
            http: { status: 418 },
            assert: async (res: Awaited<ReturnType<typeof responseProvider>>) => {
                expect(res.status).toBe(418)
                const text = await getBodyText(res.body)
                expect(text).toContain('<h1>Test</h1>')
            },
        },
    ])('applies surfaceBehavior http modifications - $name', async ({ http, assert }) => {
        mockHttpRequest({
            surfaceDecisions: {
                ...surfaceDecisionsResponse,
                surfaceBehavior: { http },
                componentsSkipped: http.body !== undefined,
            },
        })

        const req = createMockRequest()
        const res = await responseProvider(req)
        await assert(res)
    })
})
