import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTmdbClient } from './tmdb'
afterEach(() => vi.unstubAllGlobals())
describe('typed search endpoints', () => {
  it('uses movie and TV endpoints for complete type-specific pages', async () => {
    const tmdbRequest = vi.fn(async () => ({ body: JSON.stringify({ results: [], total_results: 0, total_pages: 1 }), source: 'network' }))
    vi.stubGlobal('window', { electronAPI: { tmdbRequest } })
    const client = createTmdbClient('fixture', 'es-ES')
    expect('searchMovies' in client).toBe(true)
    expect('searchTv' in client).toBe(true)
    await client.searchMovies('Alien', 2)
    await client.searchTv('Alien', 3)
    expect(tmdbRequest).toHaveBeenCalledWith('/search/movie', expect.objectContaining({ query: 'Alien', page: '2' }))
    expect(tmdbRequest).toHaveBeenCalledWith('/search/tv', expect.objectContaining({ query: 'Alien', page: '3' }))
  })
})
