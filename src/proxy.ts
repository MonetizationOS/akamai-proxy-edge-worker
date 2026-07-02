import { MOSProxyBuilder, type MOSProxy } from '@monetizationos/proxy'
import type { AkamaiRequest } from './akamaiRequest'
import { buildPropertyBaseUrl, getClientRelativeUrl } from './akamaiRequest'
import type { Env } from './env'
import { buildOriginSubrequestOptions, httpRequestAsFetcher } from './akamaiHttp'
import { akamaiHtmlRewriter } from './akamaiHtmlRewriter'

export function createProxy(env: Env, akamaiRequest: AkamaiRequest): MOSProxy {
    // mos-proxy builds API URLs on MONETIZATION_OS_HOST (e.g. api.monetizationos.com). Cloudflare/Fastly
    // fetch that host directly (Fastly uses a named backend). Akamai httpRequest() only reaches hostnames on
    // this property, so sub-requests must use the property hostname (see README /mos-api rule).
    const apiPathPrefix = env.MONETIZATION_OS_API_PATH_PREFIX || '/mos-api'
    const propertyBaseUrl = buildPropertyBaseUrl(akamaiRequest)

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
            surfaceDecisionsCookies: env.SURFACE_DECISIONS_COOKIES,
            originRequestHeaders: env.ORIGIN_REQUEST_HEADERS ?? {},
        })
        // mos-proxy builds origin URLs on ORIGIN_URL for link rewriting. httpRequest() must use a relative URL
        // resolved against the parent client request (Akamai docs: httpRequest(request.url)). Absolute URLs
        // built from request.host break staging tests via edgesuite-staging.net when Host is overridden.
        .withOriginFetcher(
            httpRequestAsFetcher(
                () => buildOriginSubrequestUrl(akamaiRequest, env.ORIGIN_URL || 'https://example.local'),
                (request) => buildOriginSubrequestOptions(akamaiRequest, env.ORIGIN_REQUEST_HEADERS ?? {}, request),
            ),
        )
        // @monetizationos/proxy only builds URLs on mosHost and calls apiFetcher — it does not know about
        // Akamai httpRequest() or property path prefixes. Fastly does the same via fetch(..., { backend }).
        .withApiFetcher(
            httpRequestAsFetcher((request) => {
                const url = new URL(request.url)
                const prefix = apiPathPrefix.startsWith('/') ? apiPathPrefix : `/${apiPathPrefix}`
                return `${prefix}${url.pathname}${url.search}`
            }),
        )
        .withHtmlRewriter(akamaiHtmlRewriter)
        .withClientMetadata({
            build() {
                return {
                    akamai: {
                        host: propertyBaseUrl,
                    },
                }
            },
        })
        .build()
}

function buildOriginSubrequestUrl(request: AkamaiRequest, originUrl: string): string {
    const originBasePath = new URL(originUrl).pathname.replace(/\/$/, '')
    return `${originBasePath}${getClientRelativeUrl(request)}`
}
