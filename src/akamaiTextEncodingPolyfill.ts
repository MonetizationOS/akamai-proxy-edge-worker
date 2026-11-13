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

export class AkamaiTextEncoder {
    encode(input: string): Uint8Array {
        return encodeUtf8(input)
    }
}

function toBytes(input: AllowSharedBufferSource | undefined): Uint8Array {
    if (!input) return new Uint8Array(0)
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    return new Uint8Array(input)
}

const REPLACEMENT = 0xfffd
const BOM = 0xfeff
/** Code units per String.fromCharCode call. */
const FLUSH_UNITS = 8192

/**
 * The WHATWG UTF-8 decoder, which Akamai's `text()` also follows: an invalid byte becomes U+FFFD and
 * the bytes after it decode on their own, so a stray Latin-1 byte can't swallow the markup after it.
 */
export class AkamaiTextDecoder {
    // A sequence split across chunks, carried to the next `decode`
    private codePoint = 0
    private bytesNeeded = 0
    private bytesSeen = 0
    private lower = 0x80
    private upper = 0xbf
    private atStart = true

    decode(input?: AllowSharedBufferSource, options?: { stream?: boolean }): string {
        const bytes = toBytes(input)
        const units: number[] = []
        let output = ''
        const emit = (codePoint: number) => {
            if (this.atStart) {
                this.atStart = false
                if (codePoint === BOM) return
            }
            if (codePoint > 0xffff) {
                const offset = codePoint - 0x10000
                units.push(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
            } else {
                units.push(codePoint)
            }
            if (units.length >= FLUSH_UNITS) {
                output += String.fromCharCode(...units)
                units.length = 0
            }
        }

        for (let i = 0; i < bytes.length; i++) {
            const byte = bytes[i]
            if (this.bytesNeeded === 0) {
                if (byte <= 0x7f) {
                    emit(byte)
                } else if (byte >= 0xc2 && byte <= 0xdf) {
                    this.bytesNeeded = 1
                    this.codePoint = byte & 0x1f
                } else if (byte >= 0xe0 && byte <= 0xef) {
                    if (byte === 0xe0) this.lower = 0xa0
                    if (byte === 0xed) this.upper = 0x9f
                    this.bytesNeeded = 2
                    this.codePoint = byte & 0x0f
                } else if (byte >= 0xf0 && byte <= 0xf4) {
                    if (byte === 0xf0) this.lower = 0x90
                    if (byte === 0xf4) this.upper = 0x8f
                    this.bytesNeeded = 3
                    this.codePoint = byte & 0x07
                } else {
                    emit(REPLACEMENT)
                }
                continue
            }
            if (byte < this.lower || byte > this.upper) {
                // The sequence ends early: replace it and decode this byte afresh
                this.reset()
                emit(REPLACEMENT)
                i--
                continue
            }
            this.lower = 0x80
            this.upper = 0xbf
            this.codePoint = (this.codePoint << 6) | (byte & 0x3f)
            if (++this.bytesSeen === this.bytesNeeded) {
                const codePoint = this.codePoint
                this.reset()
                emit(codePoint)
            }
        }

        if (!options?.stream) {
            // A sequence the input ends inside is never completed once the stream ends
            if (this.bytesNeeded) {
                this.reset()
                emit(REPLACEMENT)
            }
            this.atStart = true
        }
        return units.length ? output + String.fromCharCode(...units) : output
    }

    private reset(): void {
        this.codePoint = 0
        this.bytesNeeded = 0
        this.bytesSeen = 0
        this.lower = 0x80
        this.upper = 0xbf
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
