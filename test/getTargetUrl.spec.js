import { describe, expect, it } from 'vitest'
import getTargetUrl from '../src/1-origin-request/getTargetUrl.js'

// Akamai's getTargetUrl uses parseUrl() internally, which returns a plain object.
// The object has protocol, hostname, port, and pathname — but `host` is not recomputed
// after mutation, so tests check individual components instead.
describe('getTargetUrl', () => {
    it('should replace protocol, hostname, port, and prepend origin pathname', () => {
        const requestUrl = 'http://example.com/foo/bar?baz=1'
        const originUrl = 'https://origin.com:8080/base/'
        const result = getTargetUrl(requestUrl, originUrl)
        expect(result.protocol).toBe('https:')
        expect(result.hostname).toBe('origin.com')
        expect(result.port).toBe('8080')
        expect(result.pathname).toBe('/base/foo/bar')
        expect(result.search).toBe('?baz=1')
    })

    it('should handle origin pathname without trailing slash', () => {
        const requestUrl = 'http://example.com/x'
        const originUrl = 'https://origin.com/base'
        const result = getTargetUrl(requestUrl, originUrl)
        expect(result.pathname).toBe('/base/x')
    })

    it('should handle empty origin pathname', () => {
        const requestUrl = 'http://example.com/y'
        const originUrl = 'https://origin.com'
        const result = getTargetUrl(requestUrl, originUrl)
        expect(result.pathname).toBe('/y')
    })

    it('should preserve query string from requestUrl', () => {
        const requestUrl = 'http://example.com/z?foo=bar'
        const originUrl = 'https://origin.com/'
        const result = getTargetUrl(requestUrl, originUrl)
        expect(result.search).toBe('?foo=bar')
    })

    it('should produce a correct toString()', () => {
        const requestUrl = 'http://example.com/foo?q=1'
        const originUrl = 'https://origin.com:8080/base/'
        const result = getTargetUrl(requestUrl, originUrl)
        expect(result.toString()).toBe('https://origin.com:8080/base/foo?q=1')
    })
})
