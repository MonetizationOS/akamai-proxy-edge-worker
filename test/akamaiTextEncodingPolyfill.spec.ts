import { afterEach, describe, expect, it } from 'vitest'
import { AkamaiTextDecoder, AkamaiTextEncoder, installTextEncodingPolyfill } from '../src/akamaiTextEncodingPolyfill'

describe('Akamai TextEncoding polyfill', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'TextEncoder')
        Reflect.deleteProperty(globalThis, 'TextDecoder')
    })

    it('encodes and decodes UTF-8', () => {
        const bytes = new AkamaiTextEncoder().encode('hello 🌍')
        expect(new AkamaiTextDecoder().decode(bytes)).toBe('hello 🌍')
    })

    it('installs globals when missing', () => {
        installTextEncodingPolyfill()
        expect(new TextEncoder().encode('test')).toBeInstanceOf(Uint8Array)
        expect(new TextDecoder().decode(new Uint8Array([116, 101, 115, 116]))).toBe('test')
    })
})
