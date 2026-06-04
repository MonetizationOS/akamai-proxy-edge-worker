import type { AkamaiEdgeResponse } from '../helpers'

export function createResponse(
    status: number,
    headers: Record<string, string[]>,
    body: string | ReadableStream<Uint8Array>,
): AkamaiEdgeResponse {
    return { status, headers, body }
}
