import { afterEach, describe, expect, it } from 'vitest'
import { AkamaiURL, installUrlPolyfill } from '../src/akamaiUrlPolyfill'

describe('Akamai URL polyfill', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'URL')
    })

    it('parses absolute URLs', () => {
        const url = new AkamaiURL('https://origin.example/path?q=1')
        expect(url.protocol).toBe('https:')
        expect(url.hostname).toBe('origin.example')
        expect(url.pathname).toBe('/path')
        expect(url.search).toBe('?q=1')
        expect(url.href).toBe('https://origin.example/path?q=1')
    })

    it('resolves relative paths against a base URL', () => {
        const base = new AkamaiURL('https://api.monetizationos.com')
        const url = new AkamaiURL('/api/v1/surface-decisions', base)
        expect(url.href).toBe('https://api.monetizationos.com/api/v1/surface-decisions')
    })

    it('accepts an existing URL-like object as input', () => {
        const original = new AkamaiURL('https://test.example/article?x=1')
        const copy = new AkamaiURL(original)
        expect(copy.href).toBe('https://test.example/article?x=1')
    })

    it('supports getTargetUrl-style mutations', () => {
        const requestUrl = new AkamaiURL('https://test.example/article')
        const originUrl = new AkamaiURL('https://origin.example/site/')

        const target = new AkamaiURL(requestUrl)
        target.protocol = originUrl.protocol
        target.host = originUrl.host
        target.port = originUrl.port
        target.pathname = originUrl.pathname.replace(/\/$/, '') + target.pathname

        expect(target.href).toBe('https://origin.example/site/article')
    })

    it('installs on globalThis when missing', () => {
        installUrlPolyfill()
        expect(typeof globalThis.URL).toBe('function')
        expect(new URL('https://test.example/').hostname).toBe('test.example')
    })
})
