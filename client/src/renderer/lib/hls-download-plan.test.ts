import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createCipheriv } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createHlsDownloadPlan,
  decryptAes128Resource,
  materializeHlsObject,
  parseHlsPlaylist,
  selectHlsVariant,
  UnsupportedHlsError,
} from '../../main/hls-download-plan'

const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'src/renderer/lib/fixtures/hls', name), 'utf8')

describe('HLS download planning', () => {
  it('resolves relative MPEG-TS segments and preserves discontinuities', () => {
    const playlist = parseHlsPlaylist(fixture('mpegts-relative.m3u8'), 'https://media.example/a/master/list.m3u8')
    expect(playlist.kind).toBe('media')
    if (playlist.kind !== 'media') return
    expect(playlist.segments.map((segment) => segment.uri)).toEqual([
      'https://media.example/a/master/segments/one.ts',
      'https://media.example/a/two.ts?token=abc',
    ])
    expect(playlist.segments.map((segment) => segment.mediaSequence)).toEqual([41, 42])
    expect(playlist.segments[1]?.discontinuity).toBe(true)
  })

  it('plans an fMP4 initialization section before media segments', () => {
    const playlist = parseHlsPlaylist(fixture('fmp4-map.m3u8'), 'https://cdn.example/vod/index.m3u8')
    expect(playlist.kind).toBe('media')
    if (playlist.kind !== 'media') return
    expect(playlist.objects.map((object) => object.kind)).toEqual(['map', 'segment', 'segment'])
    expect(playlist.objects[0]).toMatchObject({
      uri: 'https://cdn.example/vod/init.mp4',
      byteRange: { length: 720, offset: 0 },
    })
  })

  it('models AES-128 keys and clears encryption after METHOD=NONE', () => {
    const playlist = parseHlsPlaylist(fixture('aes128.m3u8'), 'https://cdn.example/vod/index.m3u8')
    expect(playlist.kind).toBe('media')
    if (playlist.kind !== 'media') return
    expect(playlist.segments[0]?.key).toMatchObject({
      method: 'AES-128',
      uri: 'https://cdn.example/vod/keys/main.key',
      ivHex: '0000000000000000000000000000002a',
    })
    expect(playlist.segments[1]?.key).toBeUndefined()
  })

  it('calculates explicit and implicit byte-range offsets', () => {
    const playlist = parseHlsPlaylist(fixture('byterange.m3u8'), 'https://cdn.example/vod/index.m3u8')
    expect(playlist.kind).toBe('media')
    if (playlist.kind !== 'media') return
    expect(playlist.segments.map((segment) => segment.byteRange)).toEqual([
      { length: 1000, offset: 500 },
      { length: 750, offset: 1500 },
    ])
  })

  it('selects the preferred 1080p variant and its default alternate audio rendition', async () => {
    const masterUrl = 'https://origin.example/start/master.m3u8'
    const redirectedMasterUrl = 'https://cdn.example/catalog/master.m3u8'
    const plan = await createHlsDownloadPlan(masterUrl, async (url) => {
      if (url === masterUrl) return { text: fixture('master-alternate-audio.m3u8'), finalUrl: redirectedMasterUrl }
      if (url === 'https://cdn.example/catalog/video/1080/index.m3u8') return { text: fixture('mpegts-relative.m3u8'), finalUrl: url }
      if (url === 'https://cdn.example/catalog/audio/en/playlist.m3u8') return { text: fixture('mpegts-relative.m3u8'), finalUrl: url }
      throw new Error(`Unexpected playlist URL: ${url}`)
    })
    expect(plan.video.playlistUrl).toBe('https://cdn.example/catalog/video/1080/index.m3u8')
    expect(plan.audio).toMatchObject({ language: 'en', name: 'English' })

    const master = parseHlsPlaylist(fixture('master-alternate-audio.m3u8'), redirectedMasterUrl)
    expect(master.kind).toBe('master')
    if (master.kind === 'master') expect(selectHlsVariant(master).height).toBe(1080)
  })

  it('rejects unsupported sample encryption before a plan is returned', () => {
    expect(() => parseHlsPlaylist(fixture('sample-aes.m3u8'), 'https://cdn.example/vod/index.m3u8'))
      .toThrowError(UnsupportedHlsError)
    expect(() => parseHlsPlaylist(fixture('sample-aes.m3u8'), 'https://cdn.example/vod/index.m3u8'))
      .toThrow('DOWNLOAD_UNSUPPORTED_DRM')
  })

  it('rejects a rolling live window instead of saving a partial program', async () => {
    const live = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n'
    await expect(createHlsDownloadPlan('https://live.example/index.m3u8', async (url) => ({ text: live, finalUrl: url })))
      .rejects.toThrow('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  })

  it('decrypts AES-128 CBC resources with an explicit IV', () => {
    const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
    const iv = Buffer.from('0000000000000000000000000000002a', 'hex')
    const clear = Buffer.from('fixture payload for encrypted HLS segment')
    const cipher = createCipheriv('aes-128-cbc', key, iv)
    const encrypted = Buffer.concat([cipher.update(clear), cipher.final()])
    expect(decryptAes128Resource(encrypted, key, iv)).toEqual(clear)
  })

  it('requests byte ranges and slices a full response when a server ignores Range', async () => {
    const source = Buffer.from('0123456789')
    const calls: Array<{ uri: string; range?: { length: number; offset: number } }> = []
    const object = {
      kind: 'segment' as const,
      uri: 'https://cdn.example/media.ts',
      byteRange: { length: 4, offset: 3 },
      mediaSequence: 1,
      discontinuity: false,
    }
    const result = await materializeHlsObject(object, async (uri, range) => {
      calls.push({ uri, range })
      return source
    })
    expect(calls).toEqual([{ uri: object.uri, range: object.byteRange }])
    expect(result.toString()).toBe('3456')
  })

  it('derives an implicit AES IV from the media sequence and caches the key', async () => {
    const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
    const iv = Buffer.alloc(16)
    iv.writeBigUInt64BE(9n, 8)
    const clear = Buffer.from('implicit sequence IV payload')
    const cipher = createCipheriv('aes-128-cbc', key, iv)
    const encrypted = Buffer.concat([cipher.update(clear), cipher.final()])
    let keyLoads = 0
    const object = {
      kind: 'segment' as const,
      uri: 'https://cdn.example/encrypted.ts',
      key: { method: 'AES-128' as const, uri: 'https://cdn.example/key.bin' },
      mediaSequence: 9,
      discontinuity: false,
    }
    const cache = new Map<string, Buffer>()
    const loader = async (uri: string) => {
      if (uri.endsWith('key.bin')) { keyLoads++; return key }
      return encrypted
    }
    expect(await materializeHlsObject(object, loader, cache)).toEqual(clear)
    expect(await materializeHlsObject(object, loader, cache)).toEqual(clear)
    expect(keyLoads).toBe(1)
  })
})
