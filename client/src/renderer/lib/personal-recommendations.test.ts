import { describe, expect, it } from 'vitest'
import { selectRecommendationSeeds, rankRecommendations } from './personal-recommendations'
import { tmdbContentId } from './tmdb'

const now = Date.parse('2026-10-26T12:00:00Z')
const id = (number: number) => tmdbContentId('movie', number)
const date = new Date(now).toISOString()
const position = (number: number, seconds: number, completed = false) => ({ content_id: id(number), position_seconds: seconds, duration_seconds: 1000, completed_at: completed ? date : null, updated_at: date })
const item = (number: number) => ({ id: id(number), title: String(number) })

describe('local recommendation ranking', () => {
  it('prioritizes explicit likes and completed watches over saved interests and brief playback', () => {
    const seeds = selectRecommendationSeeds({
      likes: [{ content_id: id(1), updated_at: date }],
      watchlist: [{ content_id: id(2), added_at: date }],
      positions: [position(3, 920, true), position(4, 15)],
    }, now)
    expect(seeds.map(seed => seed.contentId)).toEqual([id(1), id(3), id(2)])
  })
  it('caps metadata requests and prevents a series with many episodes from dominating', () => {
    const series = tmdbContentId('tv', 7)
    const input = { likes: [], watchlist: [], positions: [
      ...Array.from({ length: 50 }, () => ({ ...position(7, 920, true), content_id: series })),
      ...Array.from({ length: 30 }, (_, index) => position(index + 10, 800)),
    ] }
    const seeds = selectRecommendationSeeds(input, now)
    expect(seeds).toHaveLength(6)
    expect(seeds.filter(seed => seed.contentId === series)).toHaveLength(1)
  })
  it('ignores malformed identities and timestamps and decays older interests', () => {
    const seeds = selectRecommendationSeeds({ likes: [
      { content_id: 'not-a-title', updated_at: date },
      { content_id: id(1), updated_at: 'invalid' },
      { content_id: id(2), updated_at: '2024-01-01T00:00:00Z' },
      { content_id: id(3), updated_at: date },
    ], watchlist: [], positions: [] }, now)
    expect(seeds.map(seed => seed.contentId)).toEqual([id(3), id(2)])
  })
  it('rewards overlapping interests, deduplicates, excludes known titles, and stays stable on ties', () => {
    const ranked = rankRecommendations([
      { weight: 8, items: [item(1), item(10), item(11), item(10)] },
      { weight: 8, items: [item(12), item(10)] },
    ], new Set([id(1)]))
    expect(ranked.map(value => value.id)).toEqual([id(10), id(12), id(11)])
  })
})
