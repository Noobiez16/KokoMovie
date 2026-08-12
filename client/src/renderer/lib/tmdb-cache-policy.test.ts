import { describe, expect, it } from 'vitest'
import { cachedTmdbItems, findCachedTmdbItem, mergeTmdbItems, searchCachedTmdb, tmdbRequestCacheKey } from '../../main/tmdb-cache-policy'

const rows = [
  {
    request_path: '/discover/movie',
    payload: JSON.stringify({ results: [
      { id: 10, title: 'Local Movie', overview: 'A cached adventure', poster_path: '/m.jpg' },
    ] }),
  },
  {
    request_path: '/trending/tv/week',
    payload: JSON.stringify({ results: [
      { id: 20, name: 'Offline Series', overview: 'Local mystery', poster_path: '/s.jpg' },
    ] }),
  },
  { request_path: '/movie/popular', payload: '{broken' },
]

describe('TMDB cache policy', () => {
  it('keeps localized request caches separate while sorting parameter order', () => {
    const english = tmdbRequestCacheKey('/movie/603', { language: 'en-US', page: '1' })
    const reorderedEnglish = tmdbRequestCacheKey('/movie/603', { page: '1', language: 'en-US' })
    const spanish = tmdbRequestCacheKey('/movie/603', { language: 'es-ES', page: '1' })

    expect(reorderedEnglish).toBe(english)
    expect(spanish).not.toBe(english)
  })

  it('normalizes page items and ignores corrupt rows', () => {
    expect(cachedTmdbItems(rows)).toMatchObject([
      { id: 10, title: 'Local Movie', media_type: 'movie' },
      { id: 20, name: 'Offline Series', media_type: 'tv' },
    ])
  })

  it('searches cached metadata locally with all query terms', () => {
    expect(searchCachedTmdb(rows, 'cached adventure').map((item) => item.id)).toEqual([10])
    expect(searchCachedTmdb(rows, 'offline mystery').map((item) => item.id)).toEqual([20])
    expect(searchCachedTmdb(rows, 'missing')).toEqual([])
  })

  it('hydrates a content summary from page cache and merges without duplicates', () => {
    expect(findCachedTmdbItem(rows, 'movie', 10)?.title).toBe('Local Movie')
    const merged = mergeTmdbItems(
      [{ id: 10, title: 'Fresh Movie', media_type: 'movie' }],
      cachedTmdbItems(rows),
    )
    expect(merged).toHaveLength(2)
    expect(merged[0]?.title).toBe('Fresh Movie')
  })
})

describe('downloaded metadata fallback', () => {
  it('reconstructs a movie without catalog cache', async () => {
    const { downloadedRowsToTmdbItem } = await import('../../main/tmdb-cache-policy')
    expect(downloadedRowsToTmdbItem([
      { episode_id: null, title: 'Saved Movie', thumbnail_url: 'offline://id/artwork.jpg', duration_mins: 120 },
    ], 'movie', 42)).toMatchObject({ id: 42, title: 'Saved Movie', runtime: 120, media_type: 'movie' })
  })

  it('reconstructs deterministic TV seasons and episodes', async () => {
    const { downloadedRowsToTmdbItem } = await import('../../main/tmdb-cache-policy')
    const item = downloadedRowsToTmdbItem([
      { episode_id: 'ep-20-2-3', title: 'Saved Series - S2E3 - Return', thumbnail_url: null, duration_mins: 45 },
      { episode_id: 'ep-20-1-1', title: 'Saved Series - S1E1 - Start', thumbnail_url: null, duration_mins: 50 },
    ], 'tv', 20)
    expect(item).toMatchObject({ name: 'Saved Series', number_of_seasons: 2, number_of_episodes: 2 })
    expect((item?.seasons as Array<{ season_number: number }>).map((season) => season.season_number)).toEqual([1, 2])
  })
})
