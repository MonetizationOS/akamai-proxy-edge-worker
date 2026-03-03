import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

export default {
    input: 'src/main.js',
    output: {
        file: 'dist/main.js',
        format: 'es',
    },
    external: [
        'http-request',
        'create-response',
        'html-rewriter',
        'log',
        'streams',
        'text-encode-transform',
    ],
    plugins: [resolve(), commonjs()],
}
