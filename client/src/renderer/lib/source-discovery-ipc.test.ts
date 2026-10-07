import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { gzipSync } from 'node:zlib'
import type { IpcMainInvokeEvent } from 'electron'
import type { ProviderResult } from '../../main/providers/interface'
import type { ProviderSourceStatus } from '../../main/providers/source-discovery'
import { FIXTURE_HEADER_VALUE } from './security-test-fixtures'

const boundary = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  preferences: {} as Record<string, { enabled: boolean }>,
  mode: 'progressive',
  extract: vi.fn(),
  request: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => boundary.handlers.set(name, handler) },
  session: {},
  app: { getPath: () => 'source-discovery-fixture' },
}))
vi.mock('fs', async (original) => {
  const actual = await original<typeof import('fs')>()
  return { ...actual, existsSync: (path: unknown) => String(path).endsWith('provider-prefs.json') || actual.existsSync(path as string),
    readFileSync: (path: unknown, ...args: any[]) => String(path).endsWith('provider-prefs.json')
      ? JSON.stringify(boundary.preferences) : (actual.readFileSync as any)(path, ...args) }
})
vi.mock('dns', async (original) => ({ ...await original<typeof import('dns')>(),
  lookup: (_hostname: string, _options: unknown, callback: (...args: any[]) => void) => callback(null, '8.8.8.8', 4),
}))
vi.mock('https', async (original) => ({ ...await original<typeof import('https')>(), request: boundary.request }))
vi.mock('../../main/db/sqlite', () => ({ getDb: () => ({ prepare: () => ({ get: () => ({ source_discovery_mode: boundary.mode }) }) }) }))
vi.mock('../../main/diagnostics', () => ({ writeDiagnosticEvent: vi.fn() }))
vi.mock('../../main/stream-extractor/index', () => ({ extractStreamWithRetry: boundary.extract }))

import { getBundledProviders } from '../../main/providers/registry'
import { getStandardHeight, registerProvidersIpc } from '../../main/ipc/providers'
import { setTrustedRendererWebContentsId } from '../../main/ipc/security'

type SearchResult = ProviderResult & { allStreams?: ProviderResult[]; sourceStatuses?: ProviderSourceStatus[] }
interface Fixture { delay?: number; resolution?: number; release?: string; body?: string; status?: number; hang?: boolean; direct?: boolean; probeDelay?: number; neverEnd?: boolean; redirect?: string; headers?: Record<string, string>; gzip?: boolean; responseFailure?: 'error' | 'aborted' }
const fixtures = new Map<string, Fixture>()
const request = { type: 'movie', tmdbId: 123 } as const
const frame = { url: 'http://localhost:5173/' }
const sender = { id: 19, mainFrame: frame, send: vi.fn() }
const event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent

function sources(entries: Array<[string, Fixture]>) {
  for (const provider of getBundledProviders()) boundary.preferences[provider.id] = { enabled: entries.some(([id]) => id === provider.id) }
  for (const [id, fixture] of entries) {
    const provider = getBundledProviders().find((item) => item.id === id)!
    fixtures.set(new URL(provider.getEmbedUrl(request)!).hostname, fixture)
    fixtures.set(id, fixture)
  }
}

function search(searchId = 'lookup') {
  const state = { settled: false, value: undefined as SearchResult | null | undefined }
  const promise = (boundary.handlers.get('providers:getFirstStream')!(event, request, searchId) as Promise<SearchResult | null>)
    .then((value) => { state.settled = true; state.value = value; return value })
  return { state, promise }
}

beforeEach(() => {
  vi.useFakeTimers()
  fixtures.clear()
  boundary.preferences = {}
  boundary.mode = 'progressive'
  boundary.extract.mockReset()
  boundary.request.mockReset()
  sender.send.mockClear()
  setTrustedRendererWebContentsId(sender.id, frame.url)
  registerProvidersIpc()
  boundary.extract.mockImplementation((embedUrl: string, options: { signal: AbortSignal }) => {
    const fixture = fixtures.get(new URL(embedUrl).hostname)!
    const provider = getBundledProviders().find((item) => new URL(item.getEmbedUrl(request)!).hostname === new URL(embedUrl).hostname)!
    return new Promise((resolve) => {
      if (fixture.hang) { options.signal.addEventListener('abort', () => resolve(null), { once: true }); return }
      setTimeout(() => resolve({ url: `https://cdn.example.test/${provider.id}/${fixture.release ?? 'unknown'}/video.${fixture.direct ? 'mp4' : 'm3u8'}`, headers: fixture.headers ?? {} }), fixture.delay ?? 0)
    })
  })
  boundary.request.mockImplementation((url: string, _options: unknown, callback: (response: EventEmitter) => void) => {
    const fixture = fixtures.get(new URL(url).pathname.split('/')[1]!)!
    const body = fixture.body ?? `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=${(fixture.resolution ?? 720) * 16 / 9}x${fixture.resolution ?? 720}\nvariant.m3u8`
    const redirected = fixture.redirect && new URL(url).pathname.endsWith('video.m3u8')
    const response = Object.assign(new EventEmitter(), { statusCode: redirected ? 302 : fixture.status ?? 200, headers: { 'content-type': fixture.direct ? 'video/mp4' : 'application/vnd.apple.mpegurl', ...(redirected ? { location: fixture.redirect } : {}), ...(fixture.gzip ? { 'content-encoding': 'gzip' } : {}) }, destroy: vi.fn(function (this: EventEmitter) { this.emit('aborted'); this.emit('error', new Error('fixture response destroyed')) }) })
    const outgoing = Object.assign(new EventEmitter(), { destroy: vi.fn(), end: () => {
      callback(response)
      const sendBody = () => {
        if (fixture.responseFailure) { response.emit(fixture.responseFailure, new Error('fixture upstream failure')); return }
        const bytes = Buffer.from(fixture.direct ? 'ftyp fixture video bytes' : body)
        response.emit('data', fixture.gzip ? gzipSync(bytes) : bytes)
        if (fixture.neverEnd) for (const delay of [1000, 5000, 10000]) setTimeout(() => response.emit('data', Buffer.from('# still streaming\n')), delay)
        if (!fixture.neverEnd) response.emit('end')
      }
      if (fixture.probeDelay) setTimeout(sendBody, fixture.probeDelay)
      else sendBody()
    } })
    return outgoing
  })
})

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); setTrustedRendererWebContentsId(null) })

describe('registered source discovery IPC', () => {
  it.each([1440, 2160])('waits beyond 3500ms for later %ip instead of early 720p', async (resolution) => {
    sources([['vidbinge', { delay: 100, resolution: 720, release: 'web-dl' }], ['vidsrc', { delay: 8000, resolution }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(3601)
    expect(lookup.state.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(4400)
    expect((await lookup.promise)?.providerId).toBe('vidsrc')
    expect(lookup.state.value?.streams[0]?.qualityInfo?.resolution).toBe(resolution)
  })

  it('returns genuine 2160p immediately and keeps correlated background alternatives', async () => {
    sources([['vidbinge', { delay: 100, resolution: 2160 }], ['vidsrc', { delay: 8000, resolution: 1440 }]])
    const lookup = search('background-search')
    await vi.advanceTimersByTimeAsync(101)
    expect(lookup.state.settled).toBe(true)
    expect((await lookup.promise)?.providerId).toBe('vidbinge')
    expect(lookup.state.value?.allStreams).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(8000)
    const [, snapshot] = sender.send.mock.calls.at(-1)!
    expect(snapshot.searchId).toBe('background-search')
    expect(snapshot.allStreams.map((item: ProviderResult) => item.providerId)).toEqual(['vidbinge', 'vidsrc'])
    expect(snapshot.sourceStatuses.every((item: ProviderSourceStatus) => item.state === 'available')).toBe(true)
    expect(lookup.state.value?.allStreams).toHaveLength(1)
  })

  it('holds 2160p CAM until a validated non-CAM 720p finishes', async () => {
    sources([['vidbinge', { delay: 100, resolution: 2160, release: 'cam' }], ['vidsrc', { delay: 8000, resolution: 720, release: 'web-dl' }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(3601)
    expect(lookup.state.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(4400)
    expect((await lookup.promise)?.providerId).toBe('vidsrc')
  })

  it.each(['progressive', 'complete'])('%s mode returns only-CAM at the 40s deadline', async (mode) => {
    boundary.mode = mode
    sources([['vidbinge', { delay: 100, resolution: 2160, release: 'cam' }], ['vidsrc', { hang: true }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(39999)
    expect(lookup.state.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await lookup.promise)?.streams[0]?.qualityInfo?.releaseType).toBe('cam')
    expect(lookup.state.value?.sourceStatuses).toContainEqual(expect.objectContaining({ providerId: 'vidsrc', state: 'timed-out' }))
  })

  it('complete scan waits even with genuine 2160p and returns when all providers finish', async () => {
    boundary.mode = 'complete'
    sources([['vidbinge', { delay: 100, resolution: 2160 }], ['vidsrc', { delay: 8000, resolution: 720 }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(3601)
    expect(lookup.state.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(4400)
    expect((await lookup.promise)?.providerId).toBe('vidbinge')
    expect(lookup.state.value?.allStreams).toHaveLength(2)
  })

  it('returns only-CAM after completion and re-extracts WEB-DL on a fresh lookup', async () => {
    sources([['vidbinge', { resolution: 720, release: 'cam' }]])
    const first = search('cam-search')
    await vi.advanceTimersByTimeAsync(1)
    expect((await first.promise)?.streams[0]?.qualityInfo?.releaseType).toBe('cam')
    sources([['vidbinge', { resolution: 1080, release: 'web-dl' }]])
    const second = search('fresh-search')
    await vi.advanceTimersByTimeAsync(1)
    expect((await second.promise)?.streams[0]?.qualityInfo).toMatchObject({ releaseType: 'standard', resolution: 1080 })
    expect(boundary.extract).toHaveBeenCalledTimes(2)
    expect(second.state.value?.allStreams).toHaveLength(1)
  })

  it.each([
    ['media playlist', { body: '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:200,\nsegment.ts\n#EXT-X-ENDLIST' }],
    ['dimensionless master', { body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000\nvariant.m3u8' }],
    ['direct file', { direct: true }],
  ] as const)('keeps validated %s at unknown resolution and prefers a known 720p', async (_name, fixture) => {
    sources([['vidbinge', { ...fixture, delay: 100 }], ['vidsrc', { delay: 8000, resolution: 720 }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(3601)
    expect(lookup.state.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(4400)
    expect((await lookup.promise)?.providerId).toBe('vidsrc')
    expect(lookup.state.value?.allStreams?.find((item) => item.providerId === 'vidbinge')?.streams[0]?.qualityInfo)
      .toMatchObject({ resolution: 0, resolutionLabel: 'Unknown', mediaValidated: true })
  })

  it('retains validated unknown-resolution media when it is the only usable source', async () => {
    sources([['vidbinge', { body: '#EXTM3U\n#EXTINF:200,\nsegment.ts\n#EXT-X-ENDLIST' }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(1)
    expect((await lookup.promise)?.streams[0]?.qualityInfo).toMatchObject({ resolution: 0, mediaValidated: true })
  })

  it.each([{ status: 403 }, { body: '<html>not video</html>' }])('rejects failed media validation %j', async (fixture) => {
    sources([['vidbinge', fixture]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(1)
    expect(await lookup.promise).toBeNull()
  })

  it('returns null at the deadline when no usable media arrives', async () => {
    sources([['vidbinge', { hang: true }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(40000)
    expect(await lookup.promise).toBeNull()
    expect(sender.send.mock.calls.at(-1)?.[1].sourceStatuses[0].state).toBe('timed-out')
  })

  it('rejects an oversized manifest and destroys its upstream response', async () => {
    sources([['vidbinge', { body: '#EXTM3U\n' + 'x'.repeat(2 * 1024 * 1024) }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(1)
    expect(await lookup.promise).toBeNull()
    expect(boundary.request.mock.results[0]?.value.destroy).toHaveBeenCalled()
  })

  it('bounds a probe whose body never completes without waiting for socket inactivity', async () => {
    sources([['vidbinge', { neverEnd: true }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(14999)
    expect(lookup.state.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(lookup.state.settled).toBe(true)
    expect(await lookup.promise).toBeNull()
    expect(boundary.request.mock.results[0]?.value.destroy).toHaveBeenCalled()
  })

  it.each([false, true])('aborts an in-flight probe direct=%s at the 40s deadline and ignores its late completion', async (direct) => {
    sources([['vidbinge', { delay: 39000, probeDelay: 2000, resolution: 2160, direct }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(40000)
    expect(await lookup.promise).toBeNull()
    expect(boundary.request.mock.results[0]?.value.destroy).toHaveBeenCalled()
    const count = sender.send.mock.calls.length
    await vi.advanceTimersByTimeAsync(1001)
    expect(sender.send).toHaveBeenCalledTimes(count)
    expect(sender.send.mock.calls.at(-1)?.[1].sourceStatuses[0].state).toBe('timed-out')
  })

  it('bounds a direct-file probe while waiting for its first bytes', async () => {
    sources([['vidbinge', { direct: true, probeDelay: 20000 }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(15001)
    expect(lookup.state.settled).toBe(true)
    expect(await lookup.promise).toBeNull()
    expect(boundary.request.mock.results[0]?.value.destroy).toHaveBeenCalled()
  })

  it('bounds decompressed manifest size as well as compressed bytes', async () => {
    sources([['vidbinge', { gzip: true, body: '#EXTM3U\n' + 'x'.repeat(2 * 1024 * 1024) }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(1)
    expect(await lookup.promise).toBeNull()
  })

  it.each(['error', 'aborted'] as const)('settles a probe on upstream response %s without unhandled errors', async (responseFailure) => {
    sources([['vidbinge', { responseFailure }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(1)
    expect(await lookup.promise).toBeNull()
  })

  it.each(['https://cdn.example.test/vidbinge/redirected.m3u8', 'https://other.example.test/vidbinge/redirected.m3u8'])
    ('scopes extracted credentials when following %s', async (redirect) => {
      const headers = { Cookie: FIXTURE_HEADER_VALUE, Authorization: FIXTURE_HEADER_VALUE, Referer: 'https://vidbinge.dev/' }
      sources([['vidbinge', { resolution: 2160, redirect, headers }]])
      const lookup = search()
      await vi.advanceTimersByTimeAsync(1)
      expect((await lookup.promise)?.streams[0]?.qualityInfo?.resolution).toBe(2160)
      expect(boundary.request.mock.calls[0]?.[1].headers).toMatchObject(headers)
      const targetHeaders = boundary.request.mock.calls[1]?.[1].headers
      if (new URL(redirect).hostname === 'cdn.example.test') expect(targetHeaders).toMatchObject(headers)
      else { expect(targetHeaders.Cookie).toBeUndefined(); expect(targetHeaders.Authorization).toBeUndefined() }
    })

  it('does not forward source credentials to an absolute variant on another origin', async () => {
    sources([['vidbinge', { headers: { Cookie: FIXTURE_HEADER_VALUE, Authorization: FIXTURE_HEADER_VALUE, Referer: 'https://vidbinge.dev/' },
      body: '#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160\nhttps://other.example.test/vidbinge/cross/variant.m3u8' }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(1)
    expect((await lookup.promise)?.streams[0]?.qualityInfo?.resolution).toBe(2160)
    expect(boundary.request.mock.calls[1]?.[0]).toBe('https://other.example.test/vidbinge/cross/variant.m3u8')
    expect(boundary.request.mock.calls[1]?.[1].headers.Cookie).toBeUndefined()
    expect(boundary.request.mock.calls[1]?.[1].headers.Authorization).toBeUndefined()
  })

  it('resolves relative variants against the final redirected manifest URL', async () => {
    sources([['vidbinge', { redirect: 'https://other.example.test/vidbinge/new-path/master.m3u8', resolution: 2160 }]])
    const lookup = search()
    await vi.advanceTimersByTimeAsync(1)
    expect((await lookup.promise)?.streams[0]?.qualityInfo?.resolution).toBe(2160)
    expect(boundary.request.mock.calls[2]?.[0]).toBe('https://other.example.test/vidbinge/new-path/variant.m3u8')
  })
})

describe('main nominal geometry', () => {
  it.each([[960, 540, 540], [1282, 534, 720], [1920, 800, 1080], [1000, 800, 720], [1800, 1400, 1080]])
    ('classifies %ix%i as %ip without promoting height alone', (width, height, expected) => {
      expect(getStandardHeight(width, height)).toBe(expected)
    })
  it.each([[3840, 0], [0, 0], [-1, 2160], [NaN, 2160], [3840, Infinity]])
    ('does not infer a tier from invalid dimensions %ix%i', (width, height) => {
      expect(getStandardHeight(width, height)).toBe(0)
    })
})
