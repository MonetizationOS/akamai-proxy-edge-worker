import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    resolve: {
        alias: {
            'html-rewriter': resolve(__dirname, 'test/mocks/html-rewriter.js'),
            'http-request': resolve(__dirname, 'test/mocks/http-request.js'),
            'create-response': resolve(__dirname, 'test/mocks/create-response.js'),
            streams: resolve(__dirname, 'test/mocks/streams.js'),
            'text-encode-transform': resolve(__dirname, 'test/mocks/text-encode-transform.js'),
        },
    },
    test: {
        environment: 'node',
    },
})
