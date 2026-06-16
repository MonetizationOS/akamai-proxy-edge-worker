import './installAkamaiGlobals'
import { createResponse } from 'create-response'
import type { AkamaiRequest } from './akamaiRequest'
import { toFetchRequest } from './akamaiRequest'
import { toAkamaiResponse } from './akamaiResponse'
import { loadEnv } from './env'
import { createProxy } from './proxy'

export function onClientRequest(_request: AkamaiRequest): void {}

export async function responseProvider(request: AkamaiRequest) {
    try {
        const env = loadEnv(request)
        const proxy = createProxy(env, request)
        const fetchRequest = toFetchRequest(request)
        const response = await proxy.handle(fetchRequest)
        return toAkamaiResponse(response)
    } catch (err) {
        return createResponse(500, { 'Content-Type': ['text/plain'] }, String(err))
    }
}
