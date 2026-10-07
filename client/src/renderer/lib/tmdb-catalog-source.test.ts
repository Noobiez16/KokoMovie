import { afterEach, expect, it, vi } from 'vitest'
import { createTmdbClient, tmdbCatalogSource } from './tmdb'

afterEach(() => { vi.unstubAllGlobals() })

it.each([
  ['network', false, 'tmdb'],
  ['cache', false, 'tmdb'],
  ['cache', true, 'cache'],
] as const)('preserves catalog source semantics for %s with stale=%s', async (source, stale, expected) => {
  const tmdbRequest = vi.fn().mockResolvedValue({ body: '{"id":603}', source, stale, fetchedAt: null })
  vi.stubGlobal('window', { electronAPI: { tmdbRequest } })

  const detail = await createTmdbClient('fixture-key').getMovie(603)
  expect(tmdbCatalogSource(detail)).toBe(expected)
  expect(tmdbCatalogSource({}, detail)).toBe(expected)
  expect(tmdbCatalogSource(null, undefined, {})).toBe('tmdb')
})
