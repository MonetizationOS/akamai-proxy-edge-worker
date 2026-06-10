/**
 * TextEncoder/TextDecoder polyfill for Akamai EdgeWorkers.
 * Must not reference TextEncoder/TextDecoder at module top level (static validation evaluates the bundle).
 */

function encodeUtf8(input: string): Uint8Array {
    const bytes: number[] = []
    for (let i = 0; i < input.length; i++) {
        let code = input.charCodeAt(i)
        if (code < 0x80) {
            bytes.push(code)
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
        } else if (code < 0xd800 || code >= 0xe000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
        } else {
            i++
            code = 0x10000 + (((code & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff))
            bytes.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f),
            )
        }
    }
    return new Uint8Array(bytes)
}

function decodeUtf8(bytes: Uint8Array): string {
    let output = ''
    for (let i = 0; i < bytes.length; ) {
        const byte1 = bytes[i++]
        if (byte1 < 0x80) {
            output += String.fromCharCode(byte1)
            continue
        }
        const byte2 = bytes[i++]
        if ((byte1 & 0xe0) === 0xc0) {
            output += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f))
            continue
        }
        const byte3 = bytes[i++]
        if ((byte1 & 0xf0) === 0xe0) {
            output += String.fromCharCode(((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f))
            continue
        }
        const byte4 = bytes[i++]
        const code =
            ((byte1 & 0x07) << 18) | ((byte2 & 0x3f) << 12) | ((byte3 & 0x3f) << 6) | (byte4 & 0x3f)
        const offset = code - 0x10000
        output += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
    }
    return output
}

export class AkamaiTextEncoder {
    encode(input: string): Uint8Array {
        return encodeUtf8(input)
    }
}

export class AkamaiTextDecoder {
    decode(input: Uint8Array): string {
        return decodeUtf8(input)
    }
}

export function installTextEncodingPolyfill(): void {
    if (typeof globalThis.TextEncoder === 'undefined') {
        globalThis.TextEncoder = AkamaiTextEncoder as unknown as typeof TextEncoder
    }
    if (typeof globalThis.TextDecoder === 'undefined') {
        globalThis.TextDecoder = AkamaiTextDecoder as unknown as typeof TextDecoder
    }
}
