/**
 * Load environment configuration from Akamai Property Manager variables.
 *
 * Equivalent to Cloudflare's Env bindings and Fastly's Config/Secret Stores.
 * Variables are set in Property Manager using the "Set Variable" behavior
 * with the PMUSER_ prefix. See README.md for the full list.
 */
export function loadEnv(request) {
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
    }
}
