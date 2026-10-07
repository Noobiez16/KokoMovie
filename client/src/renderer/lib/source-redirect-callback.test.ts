import { describe, expect, it, vi, afterEach } from 'vitest'
import http from 'node:http'
vi.mock('https', async (original) => { const actual = await original<any>(); return { ...actual, request: vi.fn(), default: actual.default } })
import * as providerHttps from 'https'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { FIXTURE_HEADER_VALUE } from './security-test-fixtures'
vi.mock('electron', () => ({ ipcMain: {}, session: {}, app: {}, BrowserWindow: {}, dialog: {}, shell: {}, net: {} }))
vi.mock('../../main/db/sqlite', () => ({ getDb: vi.fn() }))
vi.mock('../../main/ffmpeg', () => ({ FFMPEG_BIN: '' }))
vi.mock('../../main/diagnostics', () => ({ writeDiagnosticEvent: vi.fn() }))
vi.mock('../../main/providers/registry', () => ({}))
vi.mock('../../main/stream-extractor/index', () => ({}))
vi.mock('../../main/ipc/security', () => ({ trustedIpcHandler: vi.fn(), PublicIpcError: Error }))
import * as downloads from '../../main/ipc/download'
import * as providers from '../../main/ipc/providers'

afterEach(() => vi.restoreAllMocks())
function redirectResponse(location: string) {
  const response = new Readable({ read() {} }) as any
  response.statusCode = 302
  response.headers = { location }
  return response
}
function requestStub() {
  const request = new EventEmitter() as any
  request.setTimeout = vi.fn()
  request.destroy = vi.fn()
  request.end = vi.fn()
  return request
}
describe('asynchronous redirect rejection', () => {
  it.each(['http://127.0.0.1/private', 'file:///secret', 'http://[bad'])('download settles without throwing for %s', async (location) => {
    let callback: any
    vi.spyOn(https, 'get').mockImplementation(((_url: any, _options: any, cb: any) => { callback = cb; return requestStub() }) as any)
    const promise = (downloads as any).fetchBuffer('https://cdn.example.test/video.mp4')
    const outcome = promise.catch((error: Error) => error)
    const response = redirectResponse(location)
    expect(() => callback(response)).not.toThrow()
    expect(await outcome).toBeInstanceOf(Error)
    expect(() => response.emit('error', new Error('redirect body failed'))).not.toThrow()
    expect(response.readableFlowing === true || response.destroyed).toBe(true)
  })
  it.each(['http://127.0.0.1/private', 'file:///secret', 'http://[bad'])('proxy ends once with 502 for %s', (location) => {
    let callback: any
    vi.mocked(providerHttps.request).mockImplementation(((_url: any, _options: any, cb: any) => { callback = cb; return requestStub() }) as any)
    const incoming = Object.assign(new EventEmitter(), { headers: {}, method: 'GET', destroyed: false }) as any
    const outgoing = Object.assign(new EventEmitter(), { headersSent: false, writeHead: vi.fn(), end: vi.fn(), destroy: vi.fn() }) as any
    ;(providers as any).streamSegment('https://cdn.example.test/video.mp4', {}, incoming, outgoing)
    const response = redirectResponse(location)
    expect(() => callback(response)).not.toThrow()
    expect(() => response.emit('error', new Error('redirect body failed'))).not.toThrow()
    expect(outgoing.writeHead).toHaveBeenCalledWith(502, expect.anything())
    expect(outgoing.end).toHaveBeenCalledTimes(1)
  })
})

import { bindTorrentDownloadSource } from '../../main/providers/torrent-download-source'
import { withLocalMediaCapability } from '../../main/providers/local-media-capability'
it.each(['localhost', '127.0.0.1'])('downloads the registered episode file and language through the actual IPv4 endpoint %s', async (hostname) => {
  const server = http.createServer((req, res) => {
    expect(req.url).toContain('/t/episode-file-8-fr.mp4?language=fr&kmc=')
    res.end('selected episode French bytes')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as any).port
  bindTorrentDownloadSource(port, (token) => token === 'episode-file-8-fr')
  try {
    const url = withLocalMediaCapability(`http://${hostname}:${port}/t/episode-file-8-fr.mp4?language=fr`)
    expect(() => providers.validateDownloadSourceUrl(url)).not.toThrow()
    expect((await downloads.fetchBuffer(url)).toString()).toBe('selected episode French bytes')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    bindTorrentDownloadSource(0, () => false)
  }
})

it.each(['http://127.0.0.1/private', 'file:///secret', 'http://[bad'])('direct video rejects and drains redirect %s', async (location) => {
  let callback: any
  vi.spyOn(https, 'get').mockImplementation(((_url: any, _options: any, cb: any) => { callback = cb; return requestStub() }) as any)
  const promise = downloads.downloadDirectVideo('redirect-test', { s3_hls_key: 'https://direct.example.test/video.mp4' } as any, Buffer.alloc(32), '.')
  const outcome = promise.catch((error) => error)
  await vi.waitFor(() => expect(callback).toBeTypeOf('function'))
  const response = redirectResponse(location)
  expect(() => callback(response)).not.toThrow()
  expect(await outcome).toBeInstanceOf(Error)
  expect(() => response.emit('error', new Error('redirect body failed'))).not.toThrow()
  expect(response.readableFlowing === true || response.destroyed).toBe(true)
})
it.each([['/next.mp4', true], ['https://other.example.test/next.mp4', false]])('download follows public redirect %s with origin header policy', async (location, sameOrigin) => {
  const requests: any[] = []
  vi.spyOn(https, 'get').mockImplementation(((url: any, options: any, callback: any) => { requests.push({ url, options, callback }); return requestStub() }) as any)
  const promise = downloads.fetchBuffer('https://cdn.example.test/video.mp4', undefined, { Authorization: FIXTURE_HEADER_VALUE, Referer: 'https://cdn.example.test/' })
  const redirect = redirectResponse(location)
  requests[0].callback(redirect)
  expect(() => redirect.emit('error', new Error('discarded redirect body failed'))).not.toThrow()
  expect(requests).toHaveLength(2)
  expect(requests[1].url).toBe(sameOrigin ? 'https://cdn.example.test/next.mp4' : location)
  expect(requests[1].options.headers.Authorization).toBe(sameOrigin ? FIXTURE_HEADER_VALUE : undefined)
  expect(requests[1].options.headers.Referer).toBe(sameOrigin ? 'https://cdn.example.test/' : undefined)
  const success = new Readable({ read() {} }) as any
  success.statusCode = 200; success.headers = {}
  requests[1].callback(success)
  success.emit('data', Buffer.from('video')); success.emit('end')
  expect((await promise).toString()).toBe('video')
})

it('proxy follows a legitimate public redirect and keeps range and origin headers', () => {
  const requests: any[] = []
  vi.mocked(providerHttps.request).mockImplementation(((url: any, options: any, callback: any) => { requests.push({ url, options, callback }); return requestStub() }) as any)
  const incoming = Object.assign(new EventEmitter(), { headers: { range: 'bytes=4-8' }, method: 'GET', destroyed: false }) as any
  const outgoing = Object.assign(new EventEmitter(), { headersSent: false, writeHead: vi.fn(), write: vi.fn(() => true), end: vi.fn(), destroy: vi.fn() }) as any
  providers.streamSegment('https://cdn.example.test/video.mp4', { Origin: 'https://provider.example.test', Referer: 'https://provider.example.test/page', Host: 'renderer-supplied.invalid' }, incoming, outgoing)
  const redirect = redirectResponse('/next.mp4')
  requests[0].callback(redirect)
  expect(() => redirect.emit('error', new Error('discarded redirect body failed'))).not.toThrow()
  expect(requests).toHaveLength(2)
  expect(requests[1].url).toBe('https://cdn.example.test/next.mp4')
  expect(requests[1].options.headers).toEqual({ Origin: 'https://provider.example.test', Referer: 'https://provider.example.test/page', Range: 'bytes=4-8' })
  const success = new Readable({ read() {} }) as any
  success.statusCode = 206; success.headers = { 'content-length': '5', 'content-range': 'bytes 4-8/20' }
  requests[1].callback(success)
  success.emit('data', Buffer.from('video')); success.emit('end'); success.emit('error', new Error('late error'))
  expect(outgoing.write).toHaveBeenCalledWith(Buffer.from('video'))
  expect(outgoing.end).toHaveBeenCalledTimes(1)
  expect(outgoing.destroy).not.toHaveBeenCalled()
})
