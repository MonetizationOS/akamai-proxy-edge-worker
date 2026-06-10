import { afterEach, describe, expect, it } from 'vitest'
import { installStreamsPolyfill } from '../src/akamaiStreamsPolyfill'

describe('Akamai streams polyfill', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'ReadableStream')
        Reflect.deleteProperty(globalThis, 'WritableStream')
        Reflect.deleteProperty(globalThis, 'TransformStream')
    })

    it('installs stream globals from the Akamai streams module', () => {
        installStreamsPolyfill()

        expect(typeof globalThis.ReadableStream).toBe('function')
        expect(typeof globalThis.WritableStream).toBe('function')
        expect(typeof globalThis.TransformStream).toBe('function')
        expect(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array([1]))
                    controller.close()
                },
            }),
        ).toBeInstanceOf(ReadableStream)
    })
})
