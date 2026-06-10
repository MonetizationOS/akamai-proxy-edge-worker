/** True when the response body should be buffered/decoded as text. */
export function isTextContentType(contentType: string | null | undefined): boolean {
    if (!contentType) {
        return false
    }

    const ct = contentType.toLowerCase()
    return (
        ct.startsWith('text/') ||
        ct.includes('json') ||
        ct.includes('javascript') ||
        ct.includes('xml') ||
        ct.includes('svg')
    )
}
