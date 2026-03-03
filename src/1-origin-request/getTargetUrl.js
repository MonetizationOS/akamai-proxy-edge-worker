import { parseUrl } from '../helpers'

export default function getTargetUrl(requestUrl, originUrl) {
    const origin = parseUrl(originUrl)
    const target = parseUrl(requestUrl)

    target.protocol = origin.protocol
    target.hostname = origin.hostname
    target.port = origin.port
    target.pathname = origin.pathname.replace(/\/$/, '') + target.pathname

    return target
}
