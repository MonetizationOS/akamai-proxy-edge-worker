import { httpRequest } from 'http-request'
import { parseUrl } from '../helpers'

/**
 * Proxy requests to MonetizationOS custom endpoints through the Akamai property.
 * Path: /mos-endpoints/foo → /mos-api/api/v1/envs/{env}/endpoints/foo
 */
export default async function customEndpointRequest(request, requestUrl, env) {
    const prefix = env.MONETIZATION_OS_ENDPOINTS_PREFIX || '/mos-endpoints/'

    const url = parseUrl(requestUrl)
    if (!url.pathname.startsWith(prefix)) {
        return null
    }

    const apiPrefix = env.MONETIZATION_OS_API_PATH_PREFIX || '/mos-api'
    const endpointPath = url.pathname.replace(new RegExp(`^${prefix}`), '').replace(/^\//, '')
    const targetUrl = `${request.scheme}://${request.host}${apiPrefix}/api/v1/envs/${extractEnvironmentFromMosKey(env)}/endpoints/${endpointPath}${url.search}`

    const options = {
        method: request.method,
        headers: buildForwardHeaders(request),
    }
    if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
        options.body = request.body
    }

    const response = await httpRequest(targetUrl, options)

    return {
        status: response.status,
        headers: response.getHeaders(),
        body: response.body,
    }
}

function extractEnvironmentFromMosKey(env) {
    const [, environmentPrefix, environmentSuffix] = env.MONETIZATION_OS_SECRET_KEY.split('_')
    return `${environmentPrefix}_${environmentSuffix}`
}

function buildForwardHeaders(request) {
    const headers = {}
    for (const name of ['Content-Type', 'Accept', 'Authorization', 'Cookie']) {
        const values = request.getHeader(name)
        if (values && values.length) {
            headers[name] = values
        }
    }
    return headers
}
