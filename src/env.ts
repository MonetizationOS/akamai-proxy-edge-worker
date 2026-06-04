import type { AkamaiRequest } from './akamaiRequest'

export type Env = {
    ORIGIN_URL: string
    SURFACE_SLUG: string
    AUTHENTICATED_USER_JWT_COOKIE_NAME: string
    ANONYMOUS_SESSION_COOKIE_NAME: string
    INJECT_SCRIPT_URL: string
    MONETIZATION_OS_HOST: string
    MONETIZATION_OS_ENDPOINTS_PREFIX: string
    /**
     * Akamai-only. Property Manager path prefix (e.g. `/mos-api`) for worker `httpRequest()`
     * sub-calls to the MonetizationOS API. Not used by `@monetizationos/proxy` or other workers.
     */
    MONETIZATION_OS_API_PATH_PREFIX: string
    MONETIZATION_OS_SECRET_KEY: string
    SURFACE_DECISIONS_IGNORE_PATHS?: string
    ORIGIN_REQUEST_HEADERS?: Record<string, string>
}

/**
 * Load environment configuration from Akamai Property Manager variables.
 *
 * Equivalent to Cloudflare's Env bindings and Fastly's Config/Secret Stores.
 * Variables are set in Property Manager using the "Set Variable" behavior
 * with the PMUSER_ prefix. See README.md for the full list.
 */
export function loadEnv(request: AkamaiRequest): Env {
    return {
        ORIGIN_URL: request.getVariable('PMUSER_ORIGIN_URL'),
        SURFACE_SLUG: request.getVariable('PMUSER_SURFACE_SLUG'),
        AUTHENTICATED_USER_JWT_COOKIE_NAME: request.getVariable('PMUSER_AUTH_JWT_COOKIE'),
        ANONYMOUS_SESSION_COOKIE_NAME: request.getVariable('PMUSER_ANON_COOKIE'),
        INJECT_SCRIPT_URL: request.getVariable('PMUSER_INJECT_SCRIPT_URL'),
        MONETIZATION_OS_HOST: request.getVariable('PMUSER_MOS_HOST'),
        MONETIZATION_OS_ENDPOINTS_PREFIX: request.getVariable('PMUSER_MOS_ENDPOINTS_PREFIX'),
        MONETIZATION_OS_API_PATH_PREFIX: request.getVariable('PMUSER_MOS_API_PREFIX'),
        MONETIZATION_OS_SECRET_KEY: request.getVariable('PMUSER_MOS_SECRET_KEY'),
        SURFACE_DECISIONS_IGNORE_PATHS: request.getVariable('PMUSER_SURFACE_DECISIONS_IGNORE_PATHS'),
        ORIGIN_REQUEST_HEADERS: parseOriginRequestHeaders(request.getVariable('PMUSER_ORIGIN_REQUEST_HEADERS')),
    }
}

function parseOriginRequestHeaders(raw: string): Record<string, string> | undefined {
    if (!raw?.trim()) {
        return undefined
    }
    try {
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, string>
        }
    } catch {
        // ignore invalid JSON
    }
    return undefined
}
