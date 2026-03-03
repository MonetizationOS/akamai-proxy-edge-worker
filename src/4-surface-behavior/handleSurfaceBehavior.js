import { cloneHeaders, setHeader, deleteHeader, appendHeader } from '../helpers'

export default function handleSurfaceBehavior(response, surfaceDecisions) {
    const http = surfaceDecisions.surfaceBehavior?.http
    if (!http || Object.keys(http).length === 0) {
        return [response, false]
    }

    let headers = cloneHeaders(response.headers)
    let status = response.status
    let body = response.body
    let returnImmediately = false

    if ('headers' in http && http.headers) {
        headers = {}
        for (const [name, value] of Object.entries(http.headers)) {
            headers[name] = Array.isArray(value) ? value : [value]
        }
    }

    if ('cookies' in http && http.cookies) {
        deleteHeader(headers, 'Set-Cookie')
        http.cookies.forEach((cookie) => {
            appendHeader(headers, 'Set-Cookie', cookie)
        })
    }

    if ('addHeaders' in http && http.addHeaders?.length) {
        http.addHeaders.forEach(({ name, value }) => {
            setHeader(headers, name, value)
        })
    }

    if ('removeHeaders' in http && http.removeHeaders?.length) {
        http.removeHeaders.forEach((name) => {
            deleteHeader(headers, name)
        })
    }

    if ('addCookies' in http && http.addCookies?.length) {
        http.addCookies.forEach((cookie) => {
            appendHeader(headers, 'Set-Cookie', cookie)
        })
    }

    if ('status' in http && http.status) {
        status = http.status
    }

    if ('body' in http && http.body !== undefined) {
        body = http.body
        returnImmediately = true
    }

    return [{ status, headers, body }, returnImmediately]
}
