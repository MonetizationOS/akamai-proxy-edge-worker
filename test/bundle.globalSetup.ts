import { rollup, type OutputOptions, type RollupOptions } from 'rollup'
import type { TestProject } from 'vitest/node'
import config from '../rollup.config.js'

declare module 'vitest' {
    export interface ProvidedContext {
        akamaiBundle: string
    }
}

/** Builds the bundle `pnpm run build` deploys, in memory, for bundle.spec.ts. */
export default async function setup(project: TestProject) {
    const options = config as RollupOptions
    const bundle = await rollup(options)
    try {
        const { output } = await bundle.generate(options.output as OutputOptions)
        project.provide('akamaiBundle', output[0].code)
    } finally {
        await bundle.close()
    }
}
