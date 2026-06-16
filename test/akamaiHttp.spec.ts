import '../src/installAkamaiGlobals'
import { describe, expect, it } from 'vitest'
import { buildOriginSubrequestOptions } from '../src/akamaiHttp'
import { toFetchRequest, type AkamaiRequest } from '../src/akamaiRequest'

describe('akamaiHttp subrequest options', () => {
    it('includes origin POST body after fetch Request.text() consumed the stream', async () => {
        const akamaiRequest = {
            path: '/api/submit',
            scheme: 'https',
            host: 'test.example',
            method: 'POST',
            query: '',
            url: '/api/submit',
            body: 'payload-123',
            getHeader: () => null,
            getHeaders: () => ({}),
            getVariable: () => '',
        } as AkamaiRequest

        const fetchRequest = toFetchRequest(akamaiRequest)
        await fetchRequest.text()

        const options = await buildOriginSubrequestOptions(akamaiRequest, {}, fetchRequest)
        expect(options.body).toBe('payload-123')
    })

    it('sets a single lowercase accept-encoding header on origin subrequests', async () => {
        const akamaiRequest = {
            path: '/',
            scheme: 'https',
            host: 'test.example',
            method: 'GET',
            query: '',
            url: '/',
            body: null,
            getHeader: () => null,
            getHeaders: () => ({
                'accept-encoding': ['gzip, br'],
                accept: ['text/html'],
            }),
            getVariable: () => '',
        } as AkamaiRequest

        const options = await buildOriginSubrequestOptions(akamaiRequest, {}, toFetchRequest(akamaiRequest))
        expect(options.headers['accept-encoding']).toEqual(['identity'])
        expect(Object.keys(options.headers).filter((k) => k.toLowerCase() === 'accept-encoding')).toHaveLength(1)
    })
})
