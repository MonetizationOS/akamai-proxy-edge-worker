import { describe, expect, it } from 'vitest'
import handleSurfaceComponents from '../src/5-surface-components/handleSurfaceComponents.js'
import { getBodyText } from './helpers.js'

const scriptTag = `<script src="https://example.com/web-components-latest.js" async defer></script>`
const env = { INJECT_SCRIPT_URL: 'https://example.com/web-components-latest.js' }

function buildSurfaceDecisions(content, cssSelector) {
    return {
        componentsSkipped: false,
        surfaceBehavior: {},
        componentBehaviors: {
            test: { metadata: { cssSelector }, content },
        },
    }
}

async function getResultText(original, content, cssSelector) {
    const html = `<html><head></head><body>${original}</body></html>`
    const response = { status: 200, headers: {}, body: html }
    const result = await handleSurfaceComponents(response, buildSurfaceDecisions(content, cssSelector), env)
    return getBodyText(result.body)
}

describe('MonetizationOS Proxy', () => {
    it.each([
        {
            name: 'Empty modification set',
            cssSelector: 'p',
            content: { replaceRange: null },
            original: '<p>First text <h2>SubTitle</h2></p>',
            expected: `<p>First text <h2>SubTitle</h2></p>`,
        },
        {
            name: 'Replace entire contents',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }] },
            },
            original: '<p>First text <h2>SubTitle</h2></p>',
            expected: `<p>REPLACEMENT</p>`,
        },
        {
            name: 'Replace entire with multiple values',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [
                        { type: 'text', content: 'REPLACEMENT1' },
                        { type: 'html', content: '<p>REPLACEMENT2</p>' },
                    ],
                },
            },
            original: '<p>First text <h2>SubTitle</h2></p>',
            expected: `<p>REPLACEMENT1<p>REPLACEMENT2</p></p>`,
        },
        {
            name: 'Replace everything after the second paragraph',
            cssSelector: 'div',
            content: {
                replaceRange: { fromMarker: 'p:nth-child(2)', replaceWith: [{ type: 'text', content: 'REPLACEMENT' }] },
            },
            original: '<div><p>First</p>Outside<p>Second</p>Outside<p>Third</p></div>',
            expected: `<div><p>First</p>Outside<p>Second</p>REPLACEMENT</div>`,
        },
        {
            name: 'Remove entire contents',
            cssSelector: 'p',
            content: { replaceRange: { replaceWith: [] } },
            original: '<p>First text <br /><h2>SubTitle</h2></p>',
            expected: `<p></p>`,
        },
        {
            name: 'Replace entire contents multiple',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }] },
            },
            original: '<p>First text <h2>SubTitle</h2></p><br /><p>Second text <h2>SubTitle</h2></p>',
            expected: `<p>REPLACEMENT</p><br /><p>REPLACEMENT</p>`,
        },
        {
            name: 'Replace up to tag',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [
                        { type: 'text', content: 'REPLACEMENT1' },
                        { type: 'html', content: '<p>REPLACEMENT2</p>' },
                    ],
                    toMarker: 'h2',
                },
            },
            original: '<p>First text <h2>SubTitle</h2> Second text.</p>',
            expected: `<p>REPLACEMENT1<p>REPLACEMENT2</p><h2>SubTitle</h2> Second text.</p>`,
        },
        {
            name: 'Replace up to self-closing tag',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [
                        { type: 'text', content: 'REPLACEMENT1' },
                        { type: 'html', content: '<p>REPLACEMENT2</p>' },
                    ],
                    toMarker: 'br',
                },
            },
            original: '<p>First text <br /> Second text.</p>',
            expected: `<p>REPLACEMENT1<p>REPLACEMENT2</p><br /> Second text.</p>`,
        },
        {
            name: 'Replace up to tag with multiple values',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [{ type: 'text', content: 'REPLACEMENT' }],
                    toMarker: 'h2',
                },
            },
            original: '<p>First text <h2>SubTitle</h2> Second text.</p>',
            expected: `<p>REPLACEMENT<h2>SubTitle</h2> Second text.</p>`,
        },
        {
            name: 'Replace up to malformed tag',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h2' },
            },
            original: '<p>First text <h2>SubTitle Second text.</p>',
            expected: `<p>REPLACEMENT<h2>SubTitle Second text.</p>`,
        },
        {
            name: 'Replace up to tag inside container',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h2' },
            },
            original: '<div><p>First text <h2>SubTitle</h2> Second text.</p></div>',
            expected: `<div><p>REPLACEMENT<h2>SubTitle</h2> Second text.</p></div>`,
        },
        {
            name: 'Replace up to tag (with intermediate elements)',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h2' },
            },
            original: '<p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>',
            expected: `<p>REPLACEMENT<h2>SubTitle</h2> Second text.</p>`,
        },
        {
            name: 'Replace up to tag inside container (with intermediate elements)',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h2' },
            },
            original: '<div><p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p></div>',
            expected: `<div><p>REPLACEMENT<h2>SubTitle</h2> Second text.</p></div>`,
        },
        {
            name: 'Replace up to tag that does not exist replaces all content',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h5' },
            },
            original: '<p>First text <h2>SubTitle</h2> Second text.</p>',
            expected: `<p>REPLACEMENT</p>`,
        },
        {
            name: 'Replace up to tag multiple',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h2' },
            },
            original:
                '<p>First text <h2>SubTitle</h2> Second text.</p><br /><p>Third text <h2>SubTitle</h2> Fourth text.</p>',
            expected: `<p>REPLACEMENT<h2>SubTitle</h2> Second text.</p><br /><p>REPLACEMENT<h2>SubTitle</h2> Fourth text.</p>`,
        },
        {
            name: 'Replace from tag',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], fromMarker: 'h2' },
            },
            original: '<p>First text <h2>SubTitle</h2> Second text.</p>',
            expected: `<p>First text <h2>SubTitle</h2>REPLACEMENT</p>`,
        },
        {
            name: 'Replace from tag multiple',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [
                        { type: 'text', content: 'REPLACEMENT1' },
                        { type: 'text', content: 'REPLACEMENT2' },
                    ],
                    fromMarker: 'h2',
                },
            },
            original: '<p>First text <h2>SubTitle</h2> Second text.</p>',
            expected: `<p>First text <h2>SubTitle</h2>REPLACEMENT1REPLACEMENT2</p>`,
        },
        {
            name: 'Replace from self-closing tag',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], fromMarker: 'br' },
            },
            original: '<p>First text <br /> Second text.</p>',
            expected: `<p>First text <br />REPLACEMENT</p>`,
        },
        {
            name: 'Replace from tag that does not exist replaces no content',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], fromMarker: 'h5' },
            },
            original: '<p>First text <h2>SubTitle</h2> Second text.</p>',
            expected: '<p>First text <h2>SubTitle</h2> Second text.</p>',
        },
        {
            name: 'Replace from tag multiple (two paragraphs)',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], fromMarker: 'h2' },
            },
            original:
                '<p>First text <h2>SubTitle</h2> Second text.</p><br /><p>Third text <h2>SubTitle</h2> Fourth text.</p>',
            expected: `<p>First text <h2>SubTitle</h2>REPLACEMENT</p><br /><p>Third text <h2>SubTitle</h2>REPLACEMENT</p>`,
        },
        {
            name: 'Replace between tags',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [{ type: 'text', content: 'REPLACEMENT' }],
                    fromMarker: 'h2',
                    toMarker: 'h3',
                },
            },
            original: '<p>First text <h2>SubTitle</h2> Second text. <h3>SubTitle 2</h3> Third text.</p>',
            expected: `<p>First text <h2>SubTitle</h2>REPLACEMENT<h3>SubTitle 2</h3> Third text.</p>`,
        },
        {
            name: 'Replace between tags in container',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [{ type: 'text', content: 'REPLACEMENT' }],
                    fromMarker: 'h2',
                    toMarker: 'h3',
                },
            },
            original:
                '<p>Prefix<div>First text <h2>SubTitle</h2> Second text. <h3>SubTitle 2</h3> Third text.</div></p>',
            expected: `<p>Prefix<div>First text <h2>SubTitle</h2>REPLACEMENT<h3>SubTitle 2</h3> Third text.</div></p>`,
        },
        {
            name: 'Replace between tags nested',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [{ type: 'text', content: 'REPLACEMENT' }],
                    fromMarker: 'h2',
                    toMarker: 'h3',
                },
            },
            original:
                '<p><div>First text <h2>SubTitle</h2></div><div>Second text. <h3>SubTitle 2</h3></div> Third text.</p>',
            // Note: Akamai uses string-level sentinel replacement, so the closing </div> and
            // opening <div> that span the replaced region are consumed. Cloudflare's implementation
            // preserves them via structured element manipulation.
            expected: `<p><div>First text <h2>SubTitle</h2>REPLACEMENT<h3>SubTitle 2</h3></div> Third text.</p>`,
        },
        {
            name: 'Replace between tags nested multiple',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [{ type: 'text', content: 'REPLACEMENT' }],
                    fromMarker: 'h2',
                    toMarker: 'h3',
                },
            },
            original:
                '<p><div>First text <h2>SubTitle</h2></div><div>Second text. <h3>SubTitle 2</h3></div> Third text.</p><p><div>First text <h2>SubTitle</h2></div><div>Second text. <h3>SubTitle 2</h3></div> Third text.</p>',
            expected: `<p><div>First text <h2>SubTitle</h2>REPLACEMENT<h3>SubTitle 2</h3></div> Third text.</p><p><div>First text <h2>SubTitle</h2>REPLACEMENT<h3>SubTitle 2</h3></div> Third text.</p>`,
        },
        {
            name: 'Replace from nested tag',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], fromMarker: 'h2' },
            },
            original:
                '<p><div>First text <h2>SubTitle</h2></div><div>Second text. <h3>SubTitle 2</h3></div> Third text.</p>',
            // Note: the closing </div> after h2 is consumed by the replacement.
            expected: `<p><div>First text <h2>SubTitle</h2>REPLACEMENT</p>`,
        },
        {
            name: 'Replace to nested tag',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h2' },
            },
            original:
                '<p><div>First text <h2>SubTitle</h2></div><div>Second text. <h3>SubTitle 2</h3></div> Third text.</p>',
            // Note: the opening <div> before h2 is consumed by the replacement.
            expected: `<p>REPLACEMENT<h2>SubTitle</h2></div><div>Second text. <h3>SubTitle 2</h3></div> Third text.</p>`,
        },
        {
            name: 'Replace between tags that do not exist',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [{ type: 'text', content: 'REPLACEMENT' }],
                    fromMarker: 'h4',
                    toMarker: 'h5',
                },
            },
            original: '<p>First text <h2>SubTitle</h2> Second text. <h3>SubTitle 2</h3> Third text.</p>',
            expected: '<p>First text <h2>SubTitle</h2> Second text. <h3>SubTitle 2</h3> Third text.</p>',
        },
        {
            name: 'Ignores :last-child selector by skipping range replacement',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h4:last-child' },
            },
            original: '<p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>',
            expected: `<p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>`,
        },
        {
            name: 'Replaces up to wildcard',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: '*' },
            },
            original: '<p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>',
            expected: `<p>REPLACEMENT<h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>`,
        },
        {
            name: 'Replaces from wildcard by replacing after the first element',
            cssSelector: 'p',
            content: {
                replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], fromMarker: '*' },
            },
            original: '<p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>',
            expected: '<p>First text <h4>Subtitle</h4>REPLACEMENT</p>',
        },
        {
            name: 'Handles from and to the same selector by ignoring the replacement',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [{ type: 'text', content: 'REPLACEMENT' }],
                    fromMarker: 'h2',
                    toMarker: 'h2',
                },
            },
            original: '<p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>',
            expected: '<p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>',
        },
        {
            name: 'Handles from and to wildcard by ignoring the replacement',
            cssSelector: 'p',
            content: {
                replaceRange: {
                    replaceWith: [{ type: 'text', content: 'REPLACEMENT' }],
                    fromMarker: '*',
                    toMarker: '*',
                },
            },
            original: '<p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>',
            expected: '<p>First text <h4>Subtitle</h4> <h4>Subtitle</h4> <h2>SubTitle</h2> Second text.</p>',
        },
    ])('truncates HTML component content - $name', async ({ content, original, expected, cssSelector }) => {
        const text = await getResultText(original, content, cssSelector)
        expect(text).toStrictEqual(
            `<html><head>${scriptTag}</head><body>${expected}</body></html>`,
        )
    })

    it('performs multiple truncations', async () => {
        const html = `
<html>
<head></head>
<body>
<p class="c1">First text <h2>SubTitle</h2></p>
<p class="c1">First text <div>Second Text</div> <h2>SubTitle</h2><div>Third Text</div></p>
<p>Some other text</p>
<p class="c2">First text <h3>SubTitle</h3>Second text</p>
<p class="c1">First text <h2>SubTitle</h2> Second text</p>
<p class="c2">First text <h3>SubTitle</h3><p class="c1">First text <h2>SubTitle</h2></p></p>
<p class="c2"><p class="c1">First text <h2>SubTitle</h2>Second text</p><h3>SubTitle</h3>Second text<p class="c1">text<h2>SubTitle</h2>text</p></p>
<p class="c2">Prefix<p class="c2">First text <h3>SubTitle</h3>Second text</p></p>
<p class="c3">First text<h3>SubTitle</h3>Second text</p>
</body>
</html>`

        const surfaceDecisions = {
            componentsSkipped: false,
            surfaceBehavior: {},
            componentBehaviors: {
                c1: {
                    metadata: { cssSelector: '.c1' },
                    content: {
                        replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h2' },
                    },
                },
                c2: {
                    metadata: { cssSelector: '.c2' },
                    content: {
                        replaceRange: { replaceWith: [{ type: 'text', content: 'REPLACEMENT' }], toMarker: 'h3' },
                    },
                },
                p: {
                    metadata: { cssSelector: 'p' },
                    content: { remove: false },
                },
                c3: {
                    metadata: { cssSelector: '.c3' },
                    content: {
                        prepend: [{ type: 'text', content: 'PREPEND' }],
                        replaceRange: {
                            replaceWith: [{ type: 'text', content: 'REPLACEMENT' }],
                            fromMarker: 'h3',
                        },
                        append: [{ type: 'text', content: 'APPEND' }],
                        after: [{ type: 'text', content: 'AFTER' }],
                    },
                },
                body: {
                    metadata: { cssSelector: 'body' },
                    content: { append: [{ type: 'text', content: 'APPEND' }] },
                },
            },
        }

        const response = { status: 200, headers: {}, body: html }
        const result = await handleSurfaceComponents(response, surfaceDecisions, env)
        const text = await getBodyText(result.body)

        expect(text).toStrictEqual(`
<html>
<head>${scriptTag}</head>
<body>
<p class="c1">REPLACEMENT<h2>SubTitle</h2></p>
<p class="c1">REPLACEMENT<h2>SubTitle</h2><div>Third Text</div></p>
<p>Some other text</p>
<p class="c2">REPLACEMENT<h3>SubTitle</h3>Second text</p>
<p class="c1">REPLACEMENT<h2>SubTitle</h2> Second text</p>
<p class="c2">REPLACEMENT<h3>SubTitle</h3><p class="c1">REPLACEMENT<h2>SubTitle</h2></p></p>
<p class="c2">REPLACEMENT<h3>SubTitle</h3>Second text<p class="c1">REPLACEMENT<h2>SubTitle</h2>text</p></p>
<p class="c2">REPLACEMENT<h3>SubTitle</h3>Second text</p></p>
<p class="c3">PREPENDFirst text<h3>SubTitle</h3>REPLACEMENTAPPEND</p>AFTER
APPEND</body>
</html>`)
    })
})
