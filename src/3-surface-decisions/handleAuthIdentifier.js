import { parse } from 'cookie'
import { appendHeader, getHeaderValues, cloneHeaders } from '../helpers'

export default function handleAuthIdentifier(request, env, response) {
    const cookieHeader = request.getHeader('Cookie')
    const cookieString = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader || ''
    const cookies = parse(cookieString)

    let anonymousIdentifier = cookies[env.ANONYMOUS_SESSION_COOKIE_NAME]
    const userJwt = cookies[env.AUTHENTICATED_USER_JWT_COOKIE_NAME]

    if (!userJwt && !anonymousIdentifier) {
        anonymousIdentifier = generateUUID()

        const allSetCookies = getHeaderValues(response.headers, 'Set-Cookie')
        const originAlreadySetsAnon = allSetCookies.some((cookie) =>
            cookie?.startsWith(`${env.ANONYMOUS_SESSION_COOKIE_NAME}=`),
        )

        if (!originAlreadySetsAnon) {
            const headers = cloneHeaders(response.headers)
            appendHeader(headers, 'Set-Cookie', `${env.ANONYMOUS_SESSION_COOKIE_NAME}=${anonymousIdentifier}; Path=/`)
            response = { ...response, headers }
        }
    }

    const authIdentifier = userJwt ? { userJwt } : anonymousIdentifier ? { anonymousIdentifier } : {}

    return [response, authIdentifier]
}

function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}
