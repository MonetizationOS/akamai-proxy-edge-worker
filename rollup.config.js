import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'

export default {
    input: 'src/main.ts',
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
    plugins: [
        typescript({ tsconfig: './tsconfig.json' }),
        resolve(),
        commonjs(),
    ],
}
