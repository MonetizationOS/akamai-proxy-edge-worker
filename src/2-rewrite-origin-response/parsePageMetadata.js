import { HtmlRewritingStream } from 'html-rewriter'
import { ReadableStream, WritableStream } from 'streams'
import { TextEncoderStream } from 'text-encode-transform'

/**
 * Extracts all `<meta>` tags from the HTML body string, keyed by their `name` or `property` attribute.
 * Uses Akamai's HtmlRewritingStream (lol-html) for reliable HTML parsing.
 */
export async function parsePageMetadata(body) {
    const metadata = {}
    if (!body) return metadata

    try {
        const rewriter = new HtmlRewritingStream()
        rewriter.onElement('meta', (element) => {
            const key = element.getAttribute('name') ?? element.getAttribute('property')
            const value = element.getAttribute('content')
            if (key && value !== null) {
                metadata[key] = value
            }
        })

        const inputStream = new ReadableStream({
            start(controller) {
                controller.enqueue(body)
                controller.close()
            },
        }).pipeThrough(new TextEncoderStream())

        await inputStream.pipeThrough(rewriter).pipeTo(new WritableStream({ write() {} }))
    } catch (err) {
        // ignore errors - return partial metadata collected so far
    }

    return metadata
}
