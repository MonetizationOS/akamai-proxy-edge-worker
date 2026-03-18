import { httpRequest } from 'http-request'

/**
 * Fetch surface decisions from the MonetizationOS API.
 *
 * Akamai httpRequest() can only reach hostnames served through the Akamai network.
 * To reach api.monetizationos.com, we route through the property using a path prefix
 * (e.g. /mos-api/...) which Property Manager maps to the API origin.
 */
export default async function fetchSurfaceDecisions(env, { surfaceSlug, anonymousIdentifier, userJwt, path, propertyBaseUrl, pageMetadata }) {
    if (!env.MONETIZATION_OS_SECRET_KEY) {
        return null
    }

    const apiPrefix = env.MONETIZATION_OS_API_PATH_PREFIX || '/mos-api'
    const url = `${propertyBaseUrl}${apiPrefix}/api/v1/surface-decisions`
    const payload = {
        surfaceSlug,
        identity: { anonymousIdentifier, userJwt },
        resource: { id: path, meta: pageMetadata },
    }

    try {
        const response = await httpRequest(url, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': ['application/json'],
                Authorization: [`Bearer ${env.MONETIZATION_OS_SECRET_KEY}`],
            },
        })

        const data = await response.json()
        if (data.status === 'error') {
            return { _error: `API error: ${data.message}` }
        }

        return data
    } catch (error) {
        return { _error: String(error) }
    }
}
