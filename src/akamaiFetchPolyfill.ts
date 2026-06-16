/**
 * Minimal Fetch API polyfill for Akamai EdgeWorkers (Headers, Request, Response).
 * @monetizationos/proxy and the Akamai adapters assume these globals exist.
 */

function textEncoder(): TextEncoder {
    return new TextEncoder()
}

function textDecoder(): TextDecoder {
    return new TextDecoder()
}

function normalizeHeaderName(name: string): string {
    return name.toLowerCase()
}

function toUrlString(input: string | URL): string {
    return typeof input === 'string' ? input : input.href
}

async function readStreamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.length
    }
    return combined
}

async function readStreamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
    return textDecoder().decode(await readStreamToBytes(stream))
}

function bodyToStream(body: BodyInit | null | undefined): { stream: ReadableStream<Uint8Array> | null; text?: string } {
    if (body === null || body === undefined) {
        return { stream: null }
    }
    if (typeof body === 'string') {
        return {
            stream: new ReadableStream({
                start(controller) {
                    controller.enqueue(textEncoder().encode(body))
                    controller.close()
                },
            }),
            text: body,
        }
    }
    if (body instanceof ReadableStream) {
        return { stream: body as ReadableStream<Uint8Array> }
    }
    throw new TypeError('Unsupported request/response body type on Akamai')
}

export class AkamaiHeaders {
    private readonly values = new Map<string, string[]>()

    constructor(init?: HeadersInit | AkamaiHeaders) {
        if (!init) return
        if (init instanceof AkamaiHeaders) {
            init.forEach((value, name) => this.append(name, value))
            return
        }
        if (Array.isArray(init)) {
            for (const [name, value] of init) {
                this.append(name, value)
            }
            return
        }
        for (const [name, value] of Object.entries(init as Record<string, string | string[]>)) {
            if (Array.isArray(value)) {
                for (const entry of value) this.append(name, entry)
            } else {
                this.append(name, value)
            }
        }
    }

    append(name: string, value: string): void {
        const key = normalizeHeaderName(name)
        const existing = this.values.get(key)
        if (existing) {
            existing.push(value)
        } else {
            this.values.set(key, [value])
        }
    }

    set(name: string, value: string): void {
        this.values.set(normalizeHeaderName(name), [value])
    }

    get(name: string): string | null {
        return this.values.get(normalizeHeaderName(name))?.[0] ?? null
    }

    delete(name: string): void {
        this.values.delete(normalizeHeaderName(name))
    }

    forEach(callback: (value: string, name: string, headers: AkamaiHeaders) => void): void {
        for (const [name, values] of this.values.entries()) {
            for (const value of values) {
                callback(value, name, this)
            }
        }
    }

    getSetCookie(): string[] {
        return [...(this.values.get('set-cookie') ?? [])]
    }
}

function isRequestLike(value: unknown): value is { url: string; method: string; headers: Headers; body: BodyInit | null } {
    return typeof value === 'object' && value !== null && 'url' in value && 'headers' in value && 'method' in value
}

export class AkamaiRequest {
    readonly url: string
    readonly method: string
    readonly headers: AkamaiHeaders
    body: ReadableStream<Uint8Array> | null = null

    private bodyStream: ReadableStream<Uint8Array> | null = null
    private cachedBodyText: string | undefined

    constructor(input: string | URL, init?: RequestInit | AkamaiRequest) {
        this.url = toUrlString(input)

        if (isRequestLike(init)) {
            this.method = (init as RequestInit).method?.toUpperCase() ?? init.method.toUpperCase()
            this.headers = new AkamaiHeaders(init.headers)
            this.assignBody(this.method === 'GET' || this.method === 'HEAD' ? null : init.body)
            return
        }

        const requestInit = init as RequestInit | undefined
        this.method = requestInit?.method?.toUpperCase() ?? 'GET'
        this.headers = new AkamaiHeaders(requestInit?.headers)
        this.assignBody(this.method === 'GET' || this.method === 'HEAD' ? null : (requestInit?.body ?? null))
    }

    private assignBody(body: BodyInit | null | undefined): void {
        const materialized = bodyToStream(body ?? null)
        this.bodyStream = materialized.stream
        this.body = materialized.stream
        if (materialized.text !== undefined) {
            this.cachedBodyText = materialized.text
        }
    }

    async text(): Promise<string> {
        if (this.cachedBodyText !== undefined) {
            return this.cachedBodyText
        }
        if (!this.bodyStream) {
            this.cachedBodyText = ''
            return this.cachedBodyText
        }
        this.cachedBodyText = await readStreamToString(this.bodyStream)
        this.bodyStream = null
        this.body = null
        return this.cachedBodyText
    }

    async json(): Promise<unknown> {
        return JSON.parse(await this.text())
    }
}

export class AkamaiResponse {
    readonly status: number
    readonly statusText: string
    readonly headers: AkamaiHeaders
    body: ReadableStream<Uint8Array> | null

    get ok(): boolean {
        return this.status >= 200 && this.status < 300
    }

    private bodyStream: ReadableStream<Uint8Array> | null
    private cachedText: string | undefined

    constructor(
        body?: BodyInit | null,
        init?: { status?: number; statusText?: string; headers?: AkamaiHeaders | HeadersInit },
    ) {
        this.status = init?.status ?? 200
        this.statusText = init?.statusText ?? ''
        this.headers = new AkamaiHeaders(init?.headers)
        const materialized = bodyToStream(body ?? null)
        this.bodyStream = materialized.stream
        this.body = materialized.stream
        if (materialized.text !== undefined) {
            this.cachedText = materialized.text
        }
    }

    async text(): Promise<string> {
        if (this.cachedText !== undefined) {
            return this.cachedText
        }
        if (!this.bodyStream) {
            this.cachedText = ''
            return this.cachedText
        }
        this.cachedText = await readStreamToString(this.bodyStream)
        this.bodyStream = null
        this.body = null
        return this.cachedText
    }

    async json(): Promise<unknown> {
        return JSON.parse(await this.text())
    }

    clone(): AkamaiResponse {
        const headers = new AkamaiHeaders(this.headers)
        if (this.cachedText !== undefined) {
            return new AkamaiResponse(this.cachedText, {
                status: this.status,
                statusText: this.statusText,
                headers,
            })
        }
        if (this.bodyStream && typeof this.bodyStream.tee === 'function') {
            const [left, right] = this.bodyStream.tee()
            this.bodyStream = left
            this.body = left
            return new AkamaiResponse(right, {
                status: this.status,
                statusText: this.statusText,
                headers,
            })
        }
        return new AkamaiResponse(null, {
            status: this.status,
            statusText: this.statusText,
            headers,
        })
    }
}

export function installFetchPolyfill(): void {
    // Always install our implementations. Akamai may expose partial Fetch globals that lack
    // methods mos-proxy relies on (e.g. Headers.getSetCookie, Response body tee).
    globalThis.Headers = AkamaiHeaders as unknown as typeof Headers
    globalThis.Request = AkamaiRequest as unknown as typeof Request
    globalThis.Response = AkamaiResponse as unknown as typeof Response
}
