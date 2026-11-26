import { clearTimeout, setTimeout } from 'node:timers'
import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { httpRequest } from 'http-request'
import { akamaiHtmlRewriter } from '../src/akamaiHtmlRewriter'
import { responseProvider } from '../src/main'
import { createHttpResponse, createMockRequest, getBodyText, surfaceDecisionsResponse } from './helpers'

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
        SURFACE_DECISIONS_COOKIES: '',
    }),
}))

const HEAD = '<html><head><meta name="article:id" content="a1"></head><body>'
const REST = '<a href="https://origin.example/next">Next</a></body></html>'

/** An origin that sends the head at once and the rest of the page only when `finish()` is called. */
function createSlowOrigin() {
    const encoder = new TextEncoder()
    const state = { finished: false, cancelled: null as unknown, pulls: 0 }
    let release!: () => void
    const released = new Promise<void>((resolve) => {
        release = resolve
    })
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encoder.encode(HEAD))
        },
        async pull(controller) {
            state.pulls++
            await released
            if (state.cancelled !== null) return
            controller.enqueue(encoder.encode(REST))
            controller.close()
            state.finished = true
        },
        cancel(reason) {
            state.cancelled = reason ?? 'cancelled'
        },
    })
    return { body, state, finish: release }
}

function streamedHtmlResponse(body: ReadableStream<Uint8Array>, contentType = 'text/html; charset=utf-8') {
    const headers = { 'Content-Type': [contentType] }
    return {
        status: 200,
        body,
        getHeader: (name: string) => (name.toLowerCase() === 'content-type' ? headers['Content-Type'] : null),
        getHeaders: () => headers,
        // Akamai buffers text(), and it once failed past 128 KB: the HTML path must not call it
        text: async () => {
            throw new Error('text() should not be called for streamed HTML')
        },
        json: async () => {
            throw new Error('json() should not be called for streamed HTML')
        },
    }
}

function mockOrigin(
    originBody: ReadableStream<Uint8Array>,
    {
        decisions = surfaceDecisionsResponse,
        decisionStatus = 200,
        onDecision,
    }: { decisions?: SurfaceDecisionResponse; decisionStatus?: number; onDecision?: () => void } = {},
) {
    vi.mocked(httpRequest).mockImplementation((url: string) => {
        if (url.includes('/api/v1/surface-decisions')) {
            onDecision?.()
            return Promise.resolve(createHttpResponse({ status: decisionStatus, json: decisions }))
        }
        return Promise.resolve(streamedHtmlResponse(originBody))
    })
}

function decisionRequestBody(): { resource: { meta: Record<string, string> } } {
    const call = vi.mocked(httpRequest).mock.calls.find(([url]) => String(url).includes('/api/v1/surface-decisions'))
    return JSON.parse((call![1] as { body: string }).body)
}

const originCalls = () =>
    vi.mocked(httpRequest).mock.calls.filter(([url]) => !String(url).includes('/api/v1/')).length

describe('Streaming origin HTML', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('sends the surface decision once the head is read, before the origin finishes the page', async () => {
        const origin = createSlowOrigin()
        let originFinishedAtDecision: boolean | null = null
        mockOrigin(origin.body, { onDecision: () => (originFinishedAtDecision = origin.state.finished) })
        // Buffering would wait for the whole page; let a regression fail the assertions rather than hang
        const fallback = setTimeout(origin.finish, 500)

        const res = await responseProvider(createMockRequest())

        expect(originFinishedAtDecision).toBe(false)
        expect(origin.state.finished).toBe(false)
        expect(decisionRequestBody().resource.meta).toEqual({ 'article:id': 'a1' })
        expect(res.status).toBe(200)
        expect(typeof res.body).not.toBe('string')

        clearTimeout(fallback)
        origin.finish()
        const text = await getBodyText(res.body)
        expect(text).toBe(`${HEAD}<a href="https://test.example/next">Next</a></body></html>`)
        expect(originCalls()).toBe(1)
    })

    it('streams the page to Akamai before the origin finishes', async () => {
        const origin = createSlowOrigin()
        mockOrigin(origin.body)

        const res = await responseProvider(createMockRequest())
        const reader = (res.body as ReadableStream<Uint8Array>).getReader()
        const first = await reader.read()

        expect(new TextDecoder().decode(first.value)).toContain('<meta name="article:id" content="a1">')
        expect(origin.state.finished).toBe(false)

        origin.finish()
        let rest = ''
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
            rest += new TextDecoder().decode(next.value)
        }
        expect(rest).toContain('https://test.example/next')
    })

    it('cancels the origin when the surface behavior replaces the page', async () => {
        const origin = createSlowOrigin()
        mockOrigin(origin.body, {
            decisions: { ...surfaceDecisionsResponse, surfaceBehavior: { http: { status: 403, body: 'DENIED' } } },
        })

        const res = await responseProvider(createMockRequest())

        expect(res.status).toBe(403)
        expect(await getBodyText(res.body)).toBe('DENIED')
        await vi.waitFor(() => expect(origin.state.cancelled).not.toBeNull())
        expect(origin.state.finished).toBe(false)
        origin.finish()
    })

    it('cancels the origin when Akamai cancels the response', async () => {
        const origin = createSlowOrigin()
        mockOrigin(origin.body)

        const res = await responseProvider(createMockRequest())
        await (res.body as ReadableStream<Uint8Array>).cancel('client went away')

        await vi.waitFor(() => expect(origin.state.cancelled).not.toBeNull())
        expect(origin.state.finished).toBe(false)
        origin.finish()
    })

    it('fails open with the whole streamed page when the surface decisions API fails', async () => {
        const origin = createSlowOrigin()
        mockOrigin(origin.body, { decisionStatus: 500 })

        const res = await responseProvider(createMockRequest())
        origin.finish()

        expect(res.status).toBe(200)
        expect(await getBodyText(res.body)).toBe(`${HEAD}<a href="https://test.example/next">Next</a></body></html>`)
        expect(originCalls()).toBe(1)
    })

    it('fails open with the whole streamed page when a later stage throws', async () => {
        const origin = createSlowOrigin()
        mockOrigin(origin.body)
        // The first session reads page metadata; the surface components session throws
        const create = akamaiHtmlRewriter.create.bind(akamaiHtmlRewriter)
        vi.spyOn(akamaiHtmlRewriter, 'create')
            .mockImplementationOnce(create)
            .mockImplementationOnce(() => {
                throw new Error('rewriter unavailable')
            })
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await responseProvider(createMockRequest())
        origin.finish()

        expect(res.status).toBe(200)
        expect(await getBodyText(res.body)).toBe(`${HEAD}<a href="https://test.example/next">Next</a></body></html>`)
        expect(akamaiHtmlRewriter.create).toHaveBeenCalledTimes(2)
        expect(originCalls()).toBe(1)
    })

    it('serves a page larger than text() could buffer without calling it', async () => {
        const page = `<html><head></head><body>${'<p>paragraph</p>'.repeat(20_000)}</body></html>`
        const bytes = new TextEncoder().encode(page)
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                for (let i = 0; i < bytes.length; i += 16 * 1024) {
                    controller.enqueue(bytes.subarray(i, i + 16 * 1024))
                }
                controller.close()
            },
        })
        mockOrigin(body)

        const res = await responseProvider(createMockRequest())

        expect(bytes.length).toBeGreaterThan(128 * 1024)
        expect(await getBodyText(res.body)).toBe(page)
    })

    it('keeps the markup after a stray non-UTF-8 byte through the polyfilled TextDecoder', async () => {
        // EdgeWorkers has no global TextDecoder; streamed bytes reach the core's decoder undecoded
        const encoder = new TextEncoder()
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode('<html><head></head><body><p>caf'))
                controller.enqueue(new Uint8Array([0xe9]))
                controller.enqueue(encoder.encode('</p><a href="https://origin.example/x">X</a></body></html>'))
                controller.close()
            },
        })
        vi.mocked(httpRequest).mockImplementation((url: string) =>
            Promise.resolve(
                url.includes('/api/v1/surface-decisions')
                    ? createHttpResponse({ json: surfaceDecisionsResponse })
                    : streamedHtmlResponse(body, 'text/html; charset=iso-8859-1'),
            ),
        )

        const res = await responseProvider(createMockRequest())
        const text = await getBodyText(res.body)

        expect(text).toBe('<html><head></head><body><p>caf�</p><a href="https://test.example/x">X</a></body></html>')
    })
})
