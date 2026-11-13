import { afterEach, describe, expect, it } from 'vitest'
import { installPromisePolyfill } from '../src/akamaiPromisePolyfill'

describe('Akamai Promise polyfill', () => {
    const nativeWithResolvers = Promise.withResolvers

    afterEach(() => {
        Promise.withResolvers = nativeWithResolvers
    })

    it('installs Promise.withResolvers when missing', async () => {
        Reflect.deleteProperty(Promise, 'withResolvers')

        installPromisePolyfill()

        const resolved = Promise.withResolvers<string>()
        resolved.resolve('done')
        await expect(resolved.promise).resolves.toBe('done')

        const rejected = Promise.withResolvers<string>()
        rejected.reject(new Error('failed'))
        await expect(rejected.promise).rejects.toThrow('failed')
    })

    it('keeps a native Promise.withResolvers', () => {
        installPromisePolyfill()

        expect(Promise.withResolvers).toBe(nativeWithResolvers)
    })
})
