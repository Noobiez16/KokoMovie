import { describe, expect, it } from 'vitest'
import {
  incomingWins,
  libraryExportSchema,
  positionKey,
  hasValidArtworkSignature,
} from '../../main/library-portability'

const payload = {
  format: 'kokomovie-library',
  schemaVersion: 1,
  exportedAt: '2026-08-03T12:00:00.000Z',
  appVersion: '1.5.1',
  library: {
    watchlist: [{ content_id: 'movie-1', content_type: 'movie', added_at: '2026-08-01T00:00:00.000Z' }],
    positions: [{
      content_id: 'movie-1', episode_id: '', content_type: 'movie',
      position_seconds: 100, duration_seconds: 1000, completed_at: null,
      updated_at: '2026-08-02T00:00:00.000Z',
    }],
    preferences: { language: 'en', subtitle_default: null, autoplay: 1, maturity_rating: 'TV-MA' },
  },
} as const

describe('library portability format', () => {
  it('validates a versioned export and rejects unknown fields/versions', () => {
    const parsed = libraryExportSchema.parse(payload)
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.library.preferences.source_discovery_mode).toBe('progressive')
    expect(libraryExportSchema.parse({
      ...payload,
      library: {
        ...payload.library,
        preferences: { ...payload.library.preferences, source_discovery_mode: 'complete' },
      },
    }).library.preferences.source_discovery_mode).toBe('complete')
    expect(() => libraryExportSchema.parse({ ...payload, schemaVersion: 2 })).toThrow()
    expect(() => libraryExportSchema.parse({ ...payload, credential: 'secret' })).toThrow()
  })

  it('uses strict timestamp ordering for deterministic merge conflicts', () => {
    expect(incomingWins('2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z')).toBe(true)
    expect(incomingWins('2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z')).toBe(false)
  })

  it('accepts only artwork matching its declared file signature', () => {
    expect(hasValidArtworkSignature(
      'a'.repeat(64) + '.jpg',
      new Uint8Array([0xff, 0xd8, 0xff]),
    )).toBe(true)
    expect(hasValidArtworkSignature(
      'a'.repeat(64) + '.jpg',
      new TextEncoder().encode('<svg>'),
    )).toBe(false)
  })

  it('keys movie and episode positions independently', () => {
    expect(positionKey(payload.library.positions[0])).toBe('movie-1\u0000')
    expect(positionKey({ content_id: 'tv-1', episode_id: 'episode-2' })).toBe('tv-1\u0000episode-2')
  })
})
