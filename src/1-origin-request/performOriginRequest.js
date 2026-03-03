import { httpRequest } from 'http-request'
import { parseUrl } from '../helpers'

/**
 * Sub-requests via httpRequest() go through the Akamai edge and do NOT
 * re-trigger EdgeWorker events.
 * Akamai routes the request to the property's configured origin server.
 */
export default function performOriginRequest(request, requestUrl, env) {
    const originBasePath = parseUrl(env.ORIGIN_URL).pathname.replace(/\/$/, '')
    const path = originBasePath + request.path
    const qs = request.query ? `?${request.query}` : ''
    const targetUrl = `${request.scheme}://${request.host}${path}${qs}`

    const headers = {}
    for (const name of ['Accept', 'Accept-Language', 'Cookie', 'User-Agent', 'Referer', 'Authorization']) {
        const values = request.getHeader(name)
        if (values && values.length) {
            headers[name] = values
        }
    }
    headers['Accept-Encoding'] = ['identity']

    return httpRequest(targetUrl, {
        method: request.method,
        headers,
    })
}
