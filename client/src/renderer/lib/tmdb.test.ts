import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backdropUrl,
  createTmdbClient,
  decodeTmdbContentId,
  decodeTmdbEpisodeId,
  episodeRank,
  isV4Token,
  posterUrl,
  tmdbContentId,
  tmdbEpisodeId,
  tmdbTitle,
  tmdbType,
  tmdbYear,
} from './tmdb'

afterEach(() => vi.restoreAllMocks())

describe('deterministic TMDB identifiers', () => {
  it.each([
    ['movie' as const, 533535],
    ['tv' as const, 1399],
    ['movie' as const, 1],
  ])('round-trips %s %i', (type, id) => {
    expect(decodeTmdbContentId(tmdbContentId(type, id))).toEqual({ type, tmdbId: id })
  })

  it('rejects arbitrary and malformed identifiers', () => {
    expect(decodeTmdbContentId('not-a-content-id')).toBeNull()
    expect(decodeTmdbContentId('00000003-0000-4000-8000-000000000001')).toBeNull()
  })

  it('round-trips episodes and ranks them season-first', () => {
    const id = tmdbEpisodeId(1399, 2, 1)
    expect(decodeTmdbEpisodeId(id)).toEqual({ tvId: 1399, season: 2, episode: 1 })
    expect(episodeRank(id)).toBeGreaterThan(episodeRank(tmdbEpisodeId(1399, 1, 99)))
    expect(decodeTmdbEpisodeId('')).toBeNull()
  })
})

describe('TMDB presentation helpers', () => {
  const movie = {
    id: 1, title: 'Movie', overview: null, poster_path: '/p.jpg',
    backdrop_path: '/b.jpg', release_date: '2025-01-02', vote_average: 7,
    original_language: 'en',
  }
  const series = {
    id: 2, name: 'Series', overview: null, poster_path: null,
    backdrop_path: null, first_air_date: '2020-09-01', vote_average: 8,
    original_language: 'es',
  }

  it('maps title, type, year, and images', () => {
    expect(tmdbTitle(movie)).toBe('Movie')
    expect(tmdbType(movie)).toBe('movie')
    expect(tmdbYear(movie)).toBe(2025)
    expect(tmdbTitle(series)).toBe('Series')
    expect(tmdbType(series)).toBe('series')
    expect(tmdbYear(series)).toBe(2020)
    expect(posterUrl('/p.jpg', 'w300')).toContain('/w300/p.jpg')
    expect(backdropUrl('/b.jpg')).toContain('/w1280/b.jpg')
    expect(posterUrl(null)).toBeNull()
  })

  it('distinguishes v3 keys from v4 tokens', () => {
    expect(isV4Token('short-v3-api-key')).toBe(false)
    expect(isV4Token('eyJheader.payload.signature')).toBe(true)
    expect(isV4Token('x'.repeat(41))).toBe(true)
  })
})

describe('localized TMDB requests', () => {
  it('adds the selected locale to every metadata endpoint', async () => {
    const tmdbRequest = vi.fn(async (_path: string, _params: Record<string, string>) => ({
      body: JSON.stringify({ results: [], total_results: 0, total_pages: 1 }),
      source: 'network' as const,
      stale: false,
      fetchedAt: new Date().toISOString(),
    }))
    vi.stubGlobal('window', { electronAPI: { tmdbRequest } })
    const client = createTmdbClient('test-api-key', 'es-ES')

    await Promise.all([
      client.trending(), client.popularMovies(), client.popularTv(), client.topRatedMovies(), client.topRatedTv(),
      client.discoverMovie(28), client.discoverTv(18), client.searchMulti('matrix'), client.getMovie(603),
      client.getTv(1399), client.getSeason(1399, 1), client.getMovieVideos(603), client.getTvVideos(1399),
      client.getSimilarMovies(603), client.getSimilarTv(1399), client.getMovieReleaseDates(603),
      client.getTvContentRatings(1399),
    ])

    expect(tmdbRequest).toHaveBeenCalledTimes(17)
    for (const [, params] of tmdbRequest.mock.calls) {
      expect(params).toMatchObject({ language: 'es-ES' })
    }
    expect(tmdbRequest).toHaveBeenCalledWith('/movie/603', expect.objectContaining({
      append_to_response: 'credits,external_ids,videos,release_dates',
    }))
    expect(tmdbRequest).toHaveBeenCalledWith('/tv/1399', expect.objectContaining({
      append_to_response: 'credits,external_ids,videos,content_ratings',
    }))
  })
})
