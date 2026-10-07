// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogApi } from '../api/catalog'
vi.mock('../store/settings', () => ({ useSettingsStore: { getState: () => ({ tmdbApiKey: 'fixture-key' }) } }))
const searchMulti = vi.hoisted(() => vi.fn())
vi.mock('./tmdb', async (original) => ({ ...await original<typeof import('./tmdb')>(), createTmdbClient: () => ({ searchMulti }) }))
beforeEach(() => { searchMulti.mockReset().mockRejectedValue(new Error('offline')) })
afterEach(() => vi.unstubAllGlobals())
describe('search fallback', () => {
  it('honors a synthesized cached first page and merges saved downloads', async () => {
    const downloaded = { id: 'local-1', title: 'Saved title', type: 'movie', releaseYear: 2026 }
    vi.stubGlobal('window', { electronAPI: { searchDownloadedCatalog: async () => [downloaded], prefsGet: async () => ({ maturity_rating: 'TV-MA' }) } })
    searchMulti.mockResolvedValue({ page: 1, results: [], total_results: 0, total_pages: 1 })
    const response = await catalogApi.search('Saved', { page: 3 })
    expect(response.data).toEqual([downloaded])
    expect(response.meta.page).toBe(1)
  })
  it('preserves a genuine cached third page without repeating saved downloads', async () => {
    vi.stubGlobal('window', { electronAPI: { searchDownloadedCatalog: async () => [{ id: 'local-1', title: 'Saved', type: 'movie' }], prefsGet: async () => ({ maturity_rating: 'TV-MA' }) } })
    searchMulti.mockResolvedValue({ page: 3, results: [], total_results: 60, total_pages: 3 })
    const response = await catalogApi.search('Saved', { page: 3 })
    expect(response.data).toEqual([])
    expect(response.meta.page).toBe(3)
  })
  it('returns usable local matches and identifies the effective page when remote page fails', async () => {
    const downloaded = { id: 'local-1', title: 'Saved title', type: 'movie', releaseYear: 2026 }
    vi.stubGlobal('window', { electronAPI: { searchDownloadedCatalog: async () => [downloaded], prefsGet: async () => ({ maturity_rating: 'TV-MA' }) } })
    const response = await catalogApi.search('Saved', { page: 3 })
    expect(response.data).toEqual([downloaded])
    expect(response.meta).toMatchObject({ page: 1, pages: 1, source: 'cache' })
  })
})
