import '../src/installAkamaiGlobals'
import { afterEach, describe, expect, it } from 'vitest'
import { AkamaiHeaders, AkamaiRequest, AkamaiResponse, installFetchPolyfill } from '../src/akamaiFetchPolyfill'

describe('Akamai Fetch polyfill', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'Headers')
        Reflect.deleteProperty(globalThis, 'Request')
        Reflect.deleteProperty(globalThis, 'Response')
    })

    it('supports Headers get/set/append/getSetCookie', () => {
        const headers = new AkamaiHeaders()
        headers.set('Content-Type', 'text/html')
        headers.append('Set-Cookie', 'a=1')
        headers.append('Set-Cookie', 'b=2')
        expect(headers.get('content-type')).toBe('text/html')
        expect(headers.getSetCookie()).toEqual(['a=1', 'b=2'])
    })

    it('supports Headers has, whatever the case', () => {
        const headers = new AkamaiHeaders({ 'Accept-Ranges': 'bytes' })
        expect(headers.has('accept-ranges')).toBe(true)
        expect(headers.has('Content-Range')).toBe(false)
        headers.delete('Accept-Ranges')
        expect(headers.has('Accept-Ranges')).toBe(false)
    })

    it('builds Request from a prior Request', () => {
        const original = new AkamaiRequest('https://test.example/page', {
            method: 'POST',
            headers: { Cookie: 'session=1' },
            body: 'payload',
        })
        const next = new AkamaiRequest('https://origin.example/page', original)
        expect(next.url).toBe('https://origin.example/page')
        expect(next.method).toBe('POST')
        expect(next.headers.get('cookie')).toBe('session=1')
    })

    it('supports Response text/json/clone', async () => {
        const response = new AkamaiResponse('{"ok":true}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
        expect(await response.json()).toEqual({ ok: true })

        const cloned = response.clone()
        expect(cloned.status).toBe(200)
        expect(await cloned.text()).toBe('{"ok":true}')
    })

    it('clones a streamed body into two full copies', async () => {
        const response = new AkamaiResponse(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('<html>'))
                    controller.enqueue(new TextEncoder().encode('</html>'))
                    controller.close()
                },
            }),
            { status: 200 },
        )

        const cloned = response.clone()
        expect(await response.text()).toBe('<html></html>')
        expect(await cloned.text()).toBe('<html></html>')
    })

    it('throws rather than clone a stream it cannot tee to an empty body', () => {
        const stream = new ReadableStream<Uint8Array>()
        Object.defineProperty(stream, 'tee', { value: undefined })
        const response = new AkamaiResponse(stream, { status: 200 })

        expect(() => response.clone()).toThrow(TypeError)
        expect(response.body).toBe(stream)
    })

    it('decodes UTF-8 correctly when stream chunks split multibyte characters', async () => {
        const bytes = new TextEncoder().encode('hello 🌍')
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(bytes.subarray(0, 7))
                controller.enqueue(bytes.subarray(7))
                controller.close()
            },
        })
        const response = new AkamaiResponse(stream, { status: 200 })
        expect(await response.text()).toBe('hello 🌍')
    })

    it('returns cached request body after text() clears the stream', async () => {
        const request = new AkamaiRequest('https://test.example/submit', {
            method: 'POST',
            body: new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('payload-123'))
                    controller.close()
                },
            }),
        })
        await request.text()
        expect(request.body).toBeNull()
        expect(await request.text()).toBe('payload-123')
    })

    it('installs globals when missing', () => {
        installFetchPolyfill()
        expect(typeof globalThis.Headers).toBe('function')
        expect(typeof globalThis.Request).toBe('function')
        expect(typeof globalThis.Response).toBe('function')
        const headers = new Headers()
        headers.set('X-Test', '1')
        expect(headers.get('x-test')).toBe('1')
    })
})
