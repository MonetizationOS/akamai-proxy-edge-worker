import { describe, expect, it } from 'vitest'
import { isTextContentType } from '../src/contentType'

describe('isTextContentType', () => {
    it.each([
        ['text/html', true],
        ['application/json', true],
        ['application/javascript', true],
        ['image/jpeg', false],
        ['font/ttf', false],
        ['application/octet-stream', false],
    ])('classifies %s as %s', (contentType, expected) => {
        expect(isTextContentType(contentType)).toBe(expected)
    })
})
