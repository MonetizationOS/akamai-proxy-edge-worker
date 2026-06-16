import { createResponse } from 'create-response'
import { isTextContentType } from './contentType'

export type AkamaiEdgeResponse = {
    status: number
    headers: Record<string, string[]>
    body: string | ReadableStream<Uint8Array>
}

export async function toAkamaiResponse(response: Response): Promise<AkamaiEdgeResponse> {
    const headers: Record<string, string[]> = {}
    response.headers.forEach((value, key) => {
        if (!headers[key]) {
            headers[key] = []
        }
        headers[key].push(value)
    })

    if (!response.body) {
        return createResponse(response.status, headers, '') as AkamaiEdgeResponse
    }

    const contentType = response.headers.get('Content-Type')
    const canStream = typeof response.body.getReader === 'function'

    // HTML is streamed for the rewriter; binary assets are streamed like the legacy worker.
    if (canStream && (contentType?.startsWith('text/html') || !isTextContentType(contentType))) {
        return createResponse(response.status, headers, response.body) as AkamaiEdgeResponse
    }

    return createResponse(response.status, headers, await response.text()) as AkamaiEdgeResponse
}
