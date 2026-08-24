import { describe, expect, it } from 'vitest'
import {
  decorateHlsManifestWithLocalCapability,
  getLocalMediaCapability,
  isAuthorizedLocalMediaRequest,
  isPermittedLocalMediaMethod,
  LOCAL_MEDIA_CAPABILITY_HEADER,
  unwrapLocalMediaProxyUrl,
  withLocalMediaCapability,
} from '../../main/providers/local-media-capability'

describe('local media capability', () => {
  it('creates one stable high-entropy base64url capability for the process', () => {
    const first = getLocalMediaCapability()
    const second = getLocalMediaCapability()

    expect(second).toBe(first)
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('authorizes only the exact capability from a query or header', () => {
    const capability = getLocalMediaCapability()

    expect(isAuthorizedLocalMediaRequest({ url: `/proxy/media?kmc=${capability}`, headers: {} })).toBe(true)
    expect(isAuthorizedLocalMediaRequest({
      url: '/proxy/media',
      headers: { [LOCAL_MEDIA_CAPABILITY_HEADER]: capability },
    })).toBe(true)
    expect(isAuthorizedLocalMediaRequest({ url: '/proxy/media', headers: {} })).toBe(false)
    expect(isAuthorizedLocalMediaRequest({ url: '/proxy/media?kmc=wrong', headers: {} })).toBe(false)
  })

  it('permits only media-safe HTTP methods', () => {
    expect(isPermittedLocalMediaMethod('GET')).toBe(true)
    expect(isPermittedLocalMediaMethod('HEAD')).toBe(true)
    expect(isPermittedLocalMediaMethod('OPTIONS')).toBe(true)
    expect(isPermittedLocalMediaMethod('POST')).toBe(false)
    expect(isPermittedLocalMediaMethod(undefined)).toBe(false)
  })

  it('appends the capability without deleting existing query parameters', () => {
    const decorated = withLocalMediaCapability('http://localhost:1234/proxy/media?format=vtt')
    const parsed = new URL(decorated)

    expect(parsed.searchParams.get('format')).toBe('vtt')
    expect(parsed.searchParams.get('kmc')).toBe(getLocalMediaCapability())
  })

  it('preserves relative and root-relative manifest paths', () => {
    const relative = withLocalMediaCapability('segment-1.ts?part=2')
    const rootRelative = withLocalMediaCapability('/proxy/https/cdn.example/key.bin')

    expect(relative).toMatch(/^segment-1\.ts\?part=2&kmc=/)
    expect(rootRelative).toMatch(/^\/proxy\/https\/cdn\.example\/key\.bin\?kmc=/)
  })

  it('converts a current-session proxy URL back to its restart-safe upstream URL', () => {
    const local = withLocalMediaCapability('http://localhost:4567/proxy/https/cdn.example/video/master.m3u8?token=abc')
    expect(unwrapLocalMediaProxyUrl(local, 4567)).toBe('https://cdn.example/video/master.m3u8?token=abc')
    expect(unwrapLocalMediaProxyUrl(local, 9999)).toBe(local)
  })

  it('decorates every local manifest child URI', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="/proxy/https/cdn.example/key.bin"',
      '#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/main.m3u8?lang=en"',
      'segment-1.ts',
      '/proxy/https/cdn.example/segment-2.ts?part=2',
      '',
    ].join('\n')

    const decorated = decorateHlsManifestWithLocalCapability(manifest)

    expect(decorated).toContain(`URI="/proxy/https/cdn.example/key.bin?kmc=${getLocalMediaCapability()}"`)
    expect(decorated).toContain(`URI="audio/main.m3u8?lang=en&kmc=${getLocalMediaCapability()}"`)
    expect(decorated).toContain(`segment-1.ts?kmc=${getLocalMediaCapability()}`)
    expect(decorated).toContain(`/proxy/https/cdn.example/segment-2.ts?part=2&kmc=${getLocalMediaCapability()}`)
  })

  it('authorizes offline scheme requests only with the current capability', () => {
    const offline = withLocalMediaCapability('offline://download-id/video.mp4')
    expect(isAuthorizedLocalMediaRequest({ url: offline, headers: {} })).toBe(true)
    expect(isAuthorizedLocalMediaRequest({ url: 'offline://download-id/video.mp4', headers: {} })).toBe(false)
    expect(isAuthorizedLocalMediaRequest({ url: 'offline://download-id/video.mp4?kmc=wrong', headers: {} })).toBe(false)
  })

  it('requires the capability for OPTIONS as well as GET and HEAD', () => {
    const url = `/proxy/media?kmc=${getLocalMediaCapability()}`
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isPermittedLocalMediaMethod(method)).toBe(true)
      expect(isAuthorizedLocalMediaRequest({ url, headers: {} })).toBe(true)
    }
    expect(isAuthorizedLocalMediaRequest({ url: '/proxy/media', headers: {} })).toBe(false)
  })
})
