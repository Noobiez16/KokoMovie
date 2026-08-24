import { describe, expect, it } from 'vitest'
import { downloadIdSchema, downloadStartSchema } from '../../main/download-contracts'

const valid = {
  contentId: 'movie-1',
  title: 'Example',
  contentType: 'movie' as const,
  manifestUrl: 'https://cdn.example.test/master.m3u8',
}

describe('download IPC contracts', () => {
  it('accepts bounded movie and series download payloads', () => {
    expect(downloadStartSchema.parse(valid)).toMatchObject(valid)
    expect(downloadStartSchema.parse({
      ...valid,
      contentType: 'series',
      episodeId: 'episode-1',
      subtitles: [{ lang: 'es', url: 'https://subs.example.test/es.vtt' }],
    }).contentType).toBe('series')
  })

  it('rejects unsafe protocols, oversized collections, and malformed fields', () => {
    expect(() => downloadStartSchema.parse({ ...valid, manifestUrl: 'file:///etc/passwd' })).toThrow()
    expect(() => downloadStartSchema.parse({ ...valid, thumbnailUrl: 'file:///etc/passwd' })).toThrow()
    expect(() => downloadStartSchema.parse({ ...valid, title: '' })).toThrow()
    expect(() => downloadStartSchema.parse({ ...valid, unexpected: true })).toThrow()
    expect(() => downloadStartSchema.parse({
      ...valid,
      subtitles: Array.from({ length: 9 }, (_, index) => ({
        lang: 'en',
        url: `https://subs.example.test/${index}.vtt`,
      })),
    })).toThrow()
  })

  it('requires UUID download identifiers', () => {
    expect(downloadIdSchema.safeParse('not-an-id').success).toBe(false)
    expect(downloadIdSchema.safeParse('2d05d7f0-44c8-4cd0-a474-d37549e5ea9c').success).toBe(true)
  })
})
