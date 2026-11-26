// The helpers build origin bodies with these globals
import '../src/installAkamaiGlobals'
import vm from 'node:vm'
import * as createResponse from 'create-response'
import * as htmlRewriter from 'html-rewriter'
import * as httpRequestModule from 'http-request'
import * as streams from 'streams'
import { afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest'
import type * as Main from '../src/main'
import { createHttpResponse, createMockRequest, getBodyText, surfaceDecisionsResponse } from './helpers'

const { httpRequest } = httpRequestModule

const BUILT_IN_MODULES: Record<string, Record<string, unknown>> = {
    'create-response': createResponse,
    'html-rewriter': htmlRewriter,
    'http-request': httpRequestModule,
    streams,
}

/** Runs the rollup bundle like EdgeWorkers: a bare V8 context, no code generation, built-in modules as imports. */
async function loadBundle(): Promise<typeof Main> {
    const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } })
    vm.runInContext(
        'delete globalThis.WebAssembly; delete globalThis.SharedArrayBuffer; delete globalThis.Atomics; delete Promise.withResolvers',
        context,
    )
    const main = new vm.SourceTextModule(inject('akamaiBundle'), { context, identifier: 'dist/main.js' })
    await main.link((specifier) => {
        const exports = BUILT_IN_MODULES[specifier]
        if (!exports) throw new Error(`No EdgeWorkers built-in module '${specifier}' in the test`)
        const names = Object.keys(exports)
        return new vm.SyntheticModule(
            names,
            function () {
                for (const name of names) this.setExport(name, exports[name])
            },
            { context, identifier: specifier },
        )
    })
    await main.evaluate()
    return main.namespace as typeof Main
}

const VARIABLES: Record<string, string> = {
    PMUSER_ORIGIN_URL: 'https://origin.example',
    PMUSER_SURFACE_SLUG: 'web',
    PMUSER_AUTH_JWT_COOKIE: 'jwt-cookie',
    PMUSER_ANON_COOKIE: 'anon-session',
    PMUSER_INJECT_SCRIPT_URL: 'https://example.com/web-components-latest.js',
    PMUSER_MOS_SECRET_KEY: 'sk_test_123_key.payload',
}

const edgeRequest = (options?: Parameters<typeof createMockRequest>[0]) => ({
    ...createMockRequest(options),
    getVariable: (name: string) => VARIABLES[name],
})

function originResponse(contentType: string, chunks: Uint8Array[]) {
    const headers = { 'Content-Type': [contentType] }
    return {
        status: 200,
        body: new ReadableStream<Uint8Array>({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(chunk)
                controller.close()
            },
        }),
        getHeader: (name: string) => (name.toLowerCase() === 'content-type' ? headers['Content-Type'] : null),
        getHeaders: () => headers,
        text: async () => {
            throw new Error('text() should not be called for a streamed body')
        },
        json: async () => {
            throw new Error('json() should not be called for a streamed body')
        },
    }
}

function mockOrigin(origin: ReturnType<typeof originResponse>, decisions = surfaceDecisionsResponse) {
    vi.mocked(httpRequest).mockImplementation((url: string) =>
        Promise.resolve(url.includes('/api/v1/surface-decisions') ? createHttpResponse({ json: decisions }) : origin),
    )
}

describe('rollup bundle in a bare V8 context', () => {
    let bundle: typeof Main
    const encoder = new TextEncoder()

    beforeAll(async () => {
        bundle = await loadBundle()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('rewrites links, sends page metadata and applies a component to an HTML page', async () => {
        const page = '<html><head><meta name="article:id" content="a1"></head><body><h1>Title</h1><a href="https://origin.example/next">Next</a></body></html>'
        mockOrigin(originResponse('text/html; charset=utf-8', [encoder.encode(page)]), {
            ...surfaceDecisionsResponse,
            componentBehaviors: {
                test: { metadata: { cssSelector: 'h1' }, content: { before: [{ type: 'html', content: '<p>café 🌍</p>' }] } },
            },
        })

        const res = await bundle.responseProvider(edgeRequest())

        expect(res.status).toBe(200)
        expect(await getBodyText(res.body)).toBe(
            '<html><head><meta name="article:id" content="a1"><script src="https://example.com/web-components-latest.js" async defer></script></head><body><p>café 🌍</p><h1>Title</h1><a href="https://test.example/next">Next</a></body></html>',
        )
        const decision = vi.mocked(httpRequest).mock.calls.find(([url]) => String(url).includes('/api/v1/surface-decisions'))
        expect(decision?.[0]).toBe('/mos-api/api/v1/surface-decisions')
        expect(JSON.parse((decision?.[1] as { body: string }).body).resource.meta).toEqual({ 'article:id': 'a1' })
    })

    it('streams a binary asset through untouched', async () => {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])
        mockOrigin(originResponse('image/png', [bytes]))

        const res = await bundle.responseProvider(edgeRequest({ path: '/image.png' }))

        expect(res.status).toBe(200)
        const reader = (res.body as ReadableStream<Uint8Array>).getReader()
        const read: number[] = []
        for (let next = await reader.read(); !next.done; next = await reader.read()) read.push(...next.value)
        expect(read).toEqual([...bytes])
    })

    it('keeps the markup after a stray Latin-1 byte split across chunks', async () => {
        mockOrigin(
            originResponse('text/html; charset=iso-8859-1', [
                encoder.encode('<html><head></head><body><p>caf'),
                new Uint8Array([0xe9]),
                encoder.encode('</p><a href="https://origin.example/x">X</a></body></html>'),
            ]),
        )

        const res = await bundle.responseProvider(edgeRequest())

        expect(await getBodyText(res.body)).toBe(
            '<html><head></head><body><p>caf�</p><a href="https://test.example/x">X</a></body></html>',
        )
    })
})
