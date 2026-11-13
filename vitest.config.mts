import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    resolve: {
        alias: {
            'html-rewriter': resolve(__dirname, 'test/mocks/html-rewriter.ts'),
            'http-request': resolve(__dirname, 'test/mocks/http-request.ts'),
            'create-response': resolve(__dirname, 'test/mocks/create-response.ts'),
            streams: resolve(__dirname, 'test/mocks/streams.ts'),
            'text-encode-transform': resolve(__dirname, 'test/mocks/text-encode-transform.ts'),
        },
    },
    test: {
        environment: 'node',
        // Tests run in their own V8 context, so the setup file can strip its globals without breaking vitest
        pool: 'vmForks',
        setupFiles: ['test/edgeWorkersGlobals.ts'],
        server: {
            deps: {
                inline: [/@monetizationos\/proxy/],
            },
        },
    },
})
