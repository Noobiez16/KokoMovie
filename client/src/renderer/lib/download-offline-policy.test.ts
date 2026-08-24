import { describe, expect, it } from 'vitest'
import { normalizeSubtitleText, parseByteRange } from '../../main/download-offline-policy'

describe('offline byte ranges', () => {
  it('supports explicit, open, and suffix ranges', () => {
    expect(parseByteRange('bytes=100-199', 1000)).toMatchObject({ status: 206, start: 100, end: 199, length: 100 })
    expect(parseByteRange('bytes=900-', 1000)).toMatchObject({ status: 206, start: 900, end: 999 })
    expect(parseByteRange('bytes=-50', 1000)).toMatchObject({ status: 206, start: 950, end: 999 })
  })

  it('caps memory and rejects unsatisfiable ranges', () => {
    expect(parseByteRange(null, 10_000, 1024)).toMatchObject({ status: 206, start: 0, end: 1023, length: 1024 })
    expect(parseByteRange('bytes=1000-', 1000).status).toBe(416)
    expect(parseByteRange('bytes=20-10', 1000).status).toBe(416)
    expect(parseByteRange('invalid', 1000).status).toBe(416)
  })
})

  it('keeps local subtitle URLs direct and proxies remote tracks', async () => {
    const { resolveSubtitleTrackUrl } = await import('../../main/download-offline-policy')
    expect(resolveSubtitleTrackUrl('offline://id/subtitle/0-en.vtt?kmc=capability', '8080', 'capability')).toBe('offline://id/subtitle/0-en.vtt?kmc=capability')
    expect(resolveSubtitleTrackUrl('https://subs.example/file.vtt', '8080', 'capability')).toBe('http://localhost:8080/proxy/subs.example/file.vtt?format=vtt&kmc=capability')
    expect(resolveSubtitleTrackUrl('https://subs.example/file.vtt', '', 'capability')).toBe('')
    expect(resolveSubtitleTrackUrl('https://subs.example/file.vtt', '8080', '')).toBe('')
  })

describe('offline subtitle normalization', () => {
  it('preserves WebVTT and converts SRT timing syntax', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello'
    expect(normalizeSubtitleText(vtt)).toBe(vtt)
    expect(normalizeSubtitleText('1\n00:00:01,250 --> 00:00:02,500\nHola'))
      .toContain('00:00:01.250 --> 00:00:02.500')
  })
})
