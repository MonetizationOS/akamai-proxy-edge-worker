import { createResponse } from 'create-response'

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
        return createResponse(response.status, headers, '')
    }

    const contentType = response.headers.get('Content-Type') ?? ''
    if (contentType.startsWith('text/html') && typeof response.body.getReader === 'function') {
        return createResponse(response.status, headers, response.body)
    }

    return createResponse(response.status, headers, await response.text())
}
