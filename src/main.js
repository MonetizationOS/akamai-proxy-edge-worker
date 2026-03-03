import { createResponse } from 'create-response'
import { loadEnv } from './env'
import { readResponseBody } from './helpers'
import customEndpointRequest from './1-origin-request/customEndpointRequest'
import performOriginRequest from './1-origin-request/performOriginRequest'
import rewriteOriginResponse from './2-rewrite-origin-response/rewriteOriginResponse'
import getSurfaceDecisions from './3-surface-decisions/getSurfaceDecisions'
import handleSurfaceBehavior from './4-surface-behavior/handleSurfaceBehavior'
import handleSurfaceComponents from './5-surface-components/handleSurfaceComponents'

export function onClientRequest(request) {}

export async function responseProvider(request) {
    const url = buildRequestUrl(request)

    try {
        const env = loadEnv(request)

        const customResponse = await customEndpointRequest(request, url, env)
        if (customResponse) {
            return createResponse(customResponse.status, customResponse.headers, customResponse.body)
        }

        const originHttpResponse = await performOriginRequest(request, url, env)

        const contentType = (originHttpResponse.getHeader('Content-Type') || [])[0]
        if (!contentType?.startsWith('text/html')) {
            return createResponse(originHttpResponse.status, originHttpResponse.getHeaders(), originHttpResponse.body)
        }

        const originBody = await readResponseBody(originHttpResponse)
        const originResponse = {
            status: originHttpResponse.status,
            headers: originHttpResponse.getHeaders(),
            body: originBody,
        }

        const rewrittenResponse = rewriteOriginResponse(url, env, originResponse)
        if (!rewrittenResponse) {
            return createResponse(originResponse.status, originResponse.headers, originResponse.body)
        }

        const [modifiedResponse, surfaceDecisions] = await getSurfaceDecisions(request, env, rewrittenResponse)
        if (!surfaceDecisions || surfaceDecisions._error) {
            return createResponse(modifiedResponse.status, modifiedResponse.headers, modifiedResponse.body)
        }

        const [behaviorResponse, returnImmediately] = handleSurfaceBehavior(modifiedResponse, surfaceDecisions)
        if (returnImmediately) {
            return createResponse(behaviorResponse.status, behaviorResponse.headers, behaviorResponse.body)
        }

        const finalResponse = await handleSurfaceComponents(behaviorResponse, surfaceDecisions, env)
        return createResponse(finalResponse.status, finalResponse.headers, finalResponse.body)
    } catch (err) {
        return createResponse(500, { 'Content-Type': ['text/plain'] }, String(err))
    }
}

function buildRequestUrl(request) {
    return `${request.scheme}://${request.host}${request.path}${request.query ? '?' + request.query : ''}`
}
