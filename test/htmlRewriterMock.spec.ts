import { ReadableStream } from 'node:stream/web'
import { clearTimeout, setTimeout } from 'node:timers'
import { TextEncoder } from 'node:util'
import { describe, expect, it } from 'vitest'
import { HtmlRewritingStream } from 'html-rewriter'

function withTimeout<T>(promise: Promise<T>, ms = 500): Promise<T> {
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader()
    while (!(await reader.read()).done) {
        // drain
    }
}

describe('html-rewriter mock', () => {
    it('errors the rewritten body when a handler throws, rather than leaving it hanging', async () => {
        const rewriter = new HtmlRewritingStream()
        rewriter.onElement('h1', () => {
            throw new Error('handler failed')
        })
        const source = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('<h1>Title</h1>'))
                controller.close()
            },
        })

        await expect(withTimeout(readAll(source.pipeThrough(rewriter)))).rejects.toThrow('handler failed')
    })
})
