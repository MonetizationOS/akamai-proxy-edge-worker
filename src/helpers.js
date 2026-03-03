/**
 * Lightweight URL parser for Akamai EdgeWorkers (no global URL constructor).
 * Returns an object with protocol, hostname, port, host, pathname, search, and toString().
 */
export function parseUrl(urlString) {
    const match = urlString.match(/^(https?:)\/\/([^/:]+)(?::(\d+))?(\/[^?]*)?(\?.*)?$/)
    if (!match) {
        return { protocol: '', hostname: '', port: '', host: '', pathname: '/', search: '', toString() { return urlString } }
    }
    const protocol = match[1]
    const hostname = match[2]
    const port = match[3] || ''
    const host = port ? `${hostname}:${port}` : hostname
    const pathname = match[4] || '/'
    const search = match[5] || ''

    return {
        protocol,
        hostname,
        port,
        host,
        pathname,
        search,
        toString() {
            const p = this.port ? `:${this.port}` : ''
            return `${this.protocol}//${this.hostname}${p}${this.pathname}${this.search}`
        },
    }
}

/**
 * Case-insensitive header helpers for Akamai's { name: [values] } header format.
 */

export function getHeaderValue(headers, name) {
    const lower = name.toLowerCase()
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lower) {
            return headers[key]?.[0] || null
        }
    }
    return null
}

export function getHeaderValues(headers, name) {
    const lower = name.toLowerCase()
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lower) {
            return headers[key] || []
        }
    }
    return []
}

export function setHeader(headers, name, value) {
    deleteHeader(headers, name)
    headers[name] = [value]
}

export function appendHeader(headers, name, value) {
    const lower = name.toLowerCase()
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lower) {
            headers[key].push(value)
            return
        }
    }
    headers[name] = [value]
}

export function deleteHeader(headers, name) {
    const lower = name.toLowerCase()
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lower) {
            delete headers[key]
        }
    }
}

export function cloneHeaders(headers) {
    const clone = {}
    for (const [key, values] of Object.entries(headers)) {
        clone[key] = [...values]
    }
    return clone
}

/**
 * Read the full body from an httpResponse, handling both small (<128KB)
 * and large responses. Akamai's .text() method has a 128KB limit,
 * so we fall back to streaming for larger bodies.
 */
export async function readResponseBody(httpResponse) {
    try {
        return await httpResponse.text()
    } catch {
        const reader = httpResponse.body.getReader()
        const chunks = []
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
        return new TextDecoder().decode(combined)
    }
}
