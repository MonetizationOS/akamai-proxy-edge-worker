import transformOriginLinks from './transformOriginLinks'
import { setHeader, deleteHeader, cloneHeaders, parseUrl } from '../helpers'

export default function rewriteOriginResponse(requestUrl, env, response) {
    const reqUrl = parseUrl(requestUrl)
    const originUrl = parseUrl(env.ORIGIN_URL)

    // Rewrite origin response header links
    const headers = {}
    for (const [name, values] of Object.entries(response.headers)) {
        try {
            headers[name] = values.map((v) => transformOriginLinks(reqUrl, originUrl, v))
        } catch (err) {
            headers[name] = [...values]
        }
    }
    setHeader(headers, 'Cache-Control', 'no-store')
    deleteHeader(headers, 'Content-Length')
    deleteHeader(headers, 'Content-Encoding')

    // Rewrite origin response body links
    let body = response.body
    if (!body?.length) {
        return { status: response.status, headers, body: '' }
    }

    try {
        body = transformOriginLinks(reqUrl, originUrl, body)
    } catch (err) {
        // keep original body on error
    }

    return { status: response.status, headers, body }
}
