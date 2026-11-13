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

    it('holds a multibyte character split across streamed chunks', () => {
        const bytes = new AkamaiTextEncoder().encode('café 🌍')
        const decoder = new AkamaiTextDecoder()
        let text = ''
        for (const chunk of [bytes.subarray(0, 4), bytes.subarray(4, 8), bytes.subarray(8)]) {
            text += decoder.decode(chunk, { stream: true })
        }
        text += decoder.decode()
        expect(text).toBe('café 🌍')
    })

    it('ends a stream cut inside a character with a replacement character', () => {
        const bytes = new AkamaiTextEncoder().encode('é')
        const decoder = new AkamaiTextDecoder()
        expect(decoder.decode(bytes.subarray(0, 1), { stream: true })).toBe('')
        expect(decoder.decode()).toBe('�')
    })

    it('installs globals when missing', () => {
        installTextEncodingPolyfill()
        expect(new TextEncoder().encode('test')).toBeInstanceOf(Uint8Array)
        expect(new TextDecoder().decode(new Uint8Array([116, 101, 115, 116]))).toBe('test')
    })
})
