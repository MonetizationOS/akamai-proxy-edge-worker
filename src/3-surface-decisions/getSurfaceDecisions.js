import fetchSurfaceDecisions from './fetchSurfaceDecisions'
import handleAuthIdentifier from './handleAuthIdentifier'

export default async function getSurfaceDecisions(request, env, response) {
    const [modifiedResponse, authIdentifier] = handleAuthIdentifier(request, env, response)

    const propertyBaseUrl = `${request.scheme}://${request.host}`
    const surfaceDecisions = await fetchSurfaceDecisions(env, {
        surfaceSlug: env.SURFACE_SLUG,
        ...authIdentifier,
        path: request.path,
        propertyBaseUrl,
    })

    return [modifiedResponse, surfaceDecisions]
}
