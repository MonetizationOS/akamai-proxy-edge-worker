import vm from 'node:vm'
// Compiles its wasm while WebAssembly is still defined
import 'html-rewriter-wasm'

/**
 * EdgeWorkers is bare V8 without code generation from strings, WebAssembly, SharedArrayBuffer or Atomics; web APIs
 * come from built-in modules, not globals. Remove every global a bare V8 context lacks, so src runs on its polyfills
 * as in production rather than on Node's natives. The `vmForks` pool keeps vitest's own code on Node's globals.
 */
const REMOVED_FROM_V8 = ['WebAssembly', 'SharedArrayBuffer', 'Atomics']
// @vitest/runner creates one per test; neither src nor @monetizationos/proxy uses it
const RUNNER_GLOBALS = ['AbortController']

const bareV8 = new Set<string>(vm.runInContext('Object.getOwnPropertyNames(globalThis)', vm.createContext()))

export const strippedGlobals = Object.getOwnPropertyNames(globalThis).filter(
    (name) =>
        (!bareV8.has(name) || REMOVED_FROM_V8.includes(name)) &&
        !RUNNER_GLOBALS.includes(name) &&
        !name.startsWith('__vitest_'),
)

for (const name of strippedGlobals) {
    Reflect.deleteProperty(globalThis, name)
}

// ES2024; EdgeWorkers doesn't publish its V8 version
export const nativeWithResolvers = Promise.withResolvers
Reflect.deleteProperty(Promise, 'withResolvers')
