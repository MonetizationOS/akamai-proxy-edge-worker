import {
    ReadableStream as AkamaiReadableStream,
    TransformStream as AkamaiTransformStream,
    WritableStream as AkamaiWritableStream,
} from 'streams'

/**
 * Akamai exposes WHATWG streams through the `streams` module instead of globalThis.
 * @monetizationos/proxy and the local Fetch polyfills expect the standard globals.
 */
export function installStreamsPolyfill(): void {
    globalThis.ReadableStream = AkamaiReadableStream
    globalThis.WritableStream = AkamaiWritableStream
    globalThis.TransformStream = AkamaiTransformStream
}
