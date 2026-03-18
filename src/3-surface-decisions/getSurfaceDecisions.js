import { parsePageMetadata } from '../2-rewrite-origin-response/parsePageMetadata'
import fetchSurfaceDecisions from './fetchSurfaceDecisions'
import handleAuthIdentifier from './handleAuthIdentifier'

export default async function getSurfaceDecisions(request, env, response) {
    const [modifiedResponse, authIdentifier] = handleAuthIdentifier(request, env, response)

    const pageMetadata = await parsePageMetadata(modifiedResponse.body)

    const propertyBaseUrl = `${request.scheme}://${request.host}`
    const surfaceDecisions = await fetchSurfaceDecisions(env, {
        surfaceSlug: env.SURFACE_SLUG,
        ...authIdentifier,
        path: request.path,
        propertyBaseUrl,
        pageMetadata,
    })

    return [modifiedResponse, surfaceDecisions]
}
