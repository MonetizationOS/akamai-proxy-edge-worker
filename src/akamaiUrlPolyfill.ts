/**
 * Minimal URL polyfill for Akamai EdgeWorkers, which do not expose the global URL constructor.
 * Covers the subset used by @monetizationos/proxy (parse, mutate protocol/host/pathname, href).
 */

type UrlParts = {
    protocol: string
    hostname: string
    port: string
    pathname: string
    search: string
}

const ABSOLUTE_URL_RE = /^(https?:)\/\/([^/:?#]+)(?::(\d+))?([^?#]*)?(\?[^#]*)?/

function toUrlString(input: string | { href?: string; toString?: () => string }): string {
    if (typeof input === 'string') {
        return input
    }
    if (typeof input.href === 'string') {
        return input.href
    }
    return String(input)
}

function parseAbsolute(input: string | { href?: string; toString?: () => string }): UrlParts {
    const url = toUrlString(input)
    const match = url.match(ABSOLUTE_URL_RE)
    if (!match) {
        throw new TypeError(`Invalid URL: ${url}`)
    }
    return {
        protocol: match[1],
        hostname: match[2],
        port: match[3] ?? '',
        pathname: match[4] || '/',
        search: match[5] ?? '',
    }
}

function resolveRelative(input: string | { href?: string; toString?: () => string }, base: UrlParts): UrlParts {
    const url = toUrlString(input)
    if (url.startsWith('//')) {
        return parseAbsolute(`${base.protocol}${url}`)
    }
    if (/^https?:\/\//.test(url)) {
        return parseAbsolute(url)
    }
    if (url.startsWith('/')) {
        const q = url.indexOf('?')
        return {
            ...base,
            pathname: q === -1 ? url : url.slice(0, q),
            search: q === -1 ? '' : url.slice(q),
        }
    }
    throw new TypeError(`Invalid URL: ${url}`)
}

export class AkamaiURL {
    private parts: UrlParts

    constructor(input: string | { href?: string; toString?: () => string }, base?: string | AkamaiURL) {
        if (base !== undefined) {
            const baseParts = typeof base === 'string' ? parseAbsolute(base) : base.parts
            this.parts = resolveRelative(input, baseParts)
            return
        }
        this.parts = parseAbsolute(input)
    }

    get protocol(): string {
        return this.parts.protocol
    }

    set protocol(value: string) {
        this.parts.protocol = value.endsWith(':') ? value : `${value}:`
    }

    get hostname(): string {
        return this.parts.hostname
    }

    get port(): string {
        return this.parts.port
    }

    get host(): string {
        return this.parts.port ? `${this.parts.hostname}:${this.parts.port}` : this.parts.hostname
    }

    set host(value: string) {
        const colon = value.lastIndexOf(':')
        if (colon > -1 && !value.endsWith(']')) {
            this.parts.hostname = value.slice(0, colon)
            this.parts.port = value.slice(colon + 1)
            return
        }
        this.parts.hostname = value
        this.parts.port = ''
    }

    set port(value: string) {
        this.parts.port = value
    }

    get pathname(): string {
        return this.parts.pathname || '/'
    }

    set pathname(value: string) {
        this.parts.pathname = value.startsWith('/') ? value : `/${value}`
    }

    get search(): string {
        return this.parts.search
    }

    get href(): string {
        const port = this.parts.port ? `:${this.parts.port}` : ''
        return `${this.parts.protocol}//${this.parts.hostname}${port}${this.pathname}${this.search}`
    }

    toString(): string {
        return this.href
    }
}

export function installUrlPolyfill(): void {
    if (typeof globalThis.URL === 'undefined') {
        globalThis.URL = AkamaiURL as unknown as typeof URL
    }
}
