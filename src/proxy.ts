import { MOSProxyBuilder, type MOSProxy } from '@monetizationos/proxy'
import type { Env } from './env'
import { httpRequestAsFetcher } from './akamaiHttp'
import { buildPropertyBaseUrl } from './akamaiRequest'
import { akamaiHtmlRewriter } from './akamaiHtmlRewriter'

export function createProxy(env: Env, propertyBaseUrl: string): MOSProxy {
    // mos-proxy builds API URLs on MONETIZATION_OS_HOST (e.g. api.monetizationos.com). Cloudflare/Fastly
    // fetch that host directly (Fastly uses a named backend). Akamai httpRequest() only reaches origins on
    // this property, so we rewrite API sub-requests to {propertyHost}{apiPathPrefix}/api/v1/... and rely on
    // a Property Manager rule that forwards /mos-api/* to api.monetizationos.com (see README).
    const apiPathPrefix = env.MONETIZATION_OS_API_PATH_PREFIX || '/mos-api'

    return new MOSProxyBuilder()
        .withConfig({
            originUrl: env.ORIGIN_URL || 'https://example.local',
            surfaceSlug: env.SURFACE_SLUG ?? '',
            mosHost: env.MONETIZATION_OS_HOST || 'https://api.monetizationos.com',
            mosSecretKey: env.MONETIZATION_OS_SECRET_KEY ?? '',
            mosEndpointsPrefix: env.MONETIZATION_OS_ENDPOINTS_PREFIX || '/mos-endpoints/',
            anonymousSessionCookieName: env.ANONYMOUS_SESSION_COOKIE_NAME,
            authenticatedUserJwtCookieName: env.AUTHENTICATED_USER_JWT_COOKIE_NAME,
            injectScriptUrl: env.INJECT_SCRIPT_URL || undefined,
            surfaceDecisionsIgnorePaths: env.SURFACE_DECISIONS_IGNORE_PATHS,
            originRequestHeaders: env.ORIGIN_REQUEST_HEADERS ?? {},
        })
        .withOriginFetcher(httpRequestAsFetcher())
        // @monetizationos/proxy only builds URLs on mosHost and calls apiFetcher — it does not know about
        // Akamai httpRequest() or property path prefixes. Fastly does the same via fetch(..., { backend }).
        .withApiFetcher(
            httpRequestAsFetcher((request) => {
                const url = new URL(request.url)
                const prefix = apiPathPrefix.startsWith('/') ? apiPathPrefix : `/${apiPathPrefix}`
                return `${propertyBaseUrl}${prefix}${url.pathname}${url.search}`
            }),
        )
        .withHtmlRewriter(akamaiHtmlRewriter)
        .withClientMetadata({
            build(request) {
                return {
                    akamai: {
                        host: buildPropertyBaseUrlFromRequest(request),
                    },
                }
            },
        })
        .build()
}

function buildPropertyBaseUrlFromRequest(request: Request): string {
    const url = new URL(request.url)
    return `${url.protocol}//${url.host}`
}
