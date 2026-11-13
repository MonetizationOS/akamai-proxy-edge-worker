import { afterEach, describe, expect, it } from 'vitest'
import { AkamaiTextDecoder, AkamaiTextEncoder, installTextEncodingPolyfill } from '../src/akamaiTextEncodingPolyfill'

// Captured before the tests below delete the globals
const NativeTextDecoder = globalThis.TextDecoder
const NativeTextEncoder = globalThis.TextEncoder

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

    it('replaces a stray Latin-1 byte without swallowing the markup after it', () => {
        // "<p>café</p><a>" in ISO-8859-1: 0xE9 starts a 3-byte UTF-8 sequence that "</" doesn't continue
        const bytes = new Uint8Array([0x3c, 0x70, 0x3e, 0x63, 0x61, 0x66, 0xe9, 0x3c, 0x2f, 0x70, 0x3e, 0x3c, 0x61, 0x3e])
        expect(new AkamaiTextDecoder().decode(bytes)).toBe('<p>caf�</p><a>')
    })

    it.each([
        { name: 'overlong', bytes: [0xc0, 0xaf, 0x41] },
        { name: 'surrogate', bytes: [0xed, 0xa0, 0x80, 0x41] },
        { name: 'above U+10FFFF', bytes: [0xf4, 0x90, 0x80, 0x80, 0x41] },
        { name: 'truncated then ASCII', bytes: [0xf0, 0x9f, 0x8c, 0x41] },
        { name: 'lone continuation', bytes: [0x80, 0xbf, 0x41] },
        { name: 'leading BOM', bytes: [0xef, 0xbb, 0xbf, 0x41, 0xef, 0xbb, 0xbf] },
    ])('decodes invalid input like the WHATWG decoder - $name', ({ bytes }) => {
        const input = new Uint8Array(bytes)
        const expected = new NativeTextDecoder().decode(input)
        expect(new AkamaiTextDecoder().decode(input)).toBe(expected)

        // Same output however the bytes are split
        for (let split = 1; split < input.length; split++) {
            const decoder = new AkamaiTextDecoder()
            const text =
                decoder.decode(input.subarray(0, split), { stream: true }) +
                decoder.decode(input.subarray(split), { stream: true }) +
                decoder.decode()
            expect(text).toBe(expected)
        }
    })

    it('decodes a large page in one call', () => {
        const page = `<p>${'café 🌍 '.repeat(20_000)}</p>`
        expect(new AkamaiTextDecoder().decode(new NativeTextEncoder().encode(page))).toBe(page)
    })

    it('installs globals when missing', () => {
        installTextEncodingPolyfill()
        expect(new TextEncoder().encode('test')).toBeInstanceOf(Uint8Array)
        expect(new TextDecoder().decode(new Uint8Array([116, 101, 115, 116]))).toBe('test')
    })
})
