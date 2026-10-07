// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { BrowsePage } from '../pages/Browse'
import { MoviesPage } from '../pages/Movies'
import { SeriesPage } from '../pages/Series'
import { catalogApi } from '../api/catalog'
const requests = vi.hoisted(() => ({ trending: vi.fn(), discoverMovie: vi.fn(), discoverTv: vi.fn() }))
vi.mock('../lib/tmdb', async (original) => ({ ...await original<any>(), createTmdbClient: () => requests }))
vi.mock('../store/settings', () => ({ useSettingsStore: Object.assign((select: any) => select({ tmdbApiKey: 'key', tmdbKeyHydrated: true }), { getState: () => ({ tmdbApiKey: 'key' }) }) }))
vi.mock('../i18n', () => ({ default: { language: 'en' } }))
vi.mock('../components/layout/AppLayout', () => ({ AppLayout: ({ children }: any) => children }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../api/playback', () => ({ playbackApi: { getContinueWatching: vi.fn().mockResolvedValue({ data: [] }) } }))
vi.mock('../components/catalog/HeroBanner', () => ({ HeroBanner: () => null }))
vi.mock('../components/catalog/ContentCard', () => ({ ContentCard: ({ content }: any) => <h2>{content.title}</h2> }))
vi.mock('../components/catalog/ContentRow', () => ({ ContentRow: ({ onViewAll, title }: any) => <button onClick={onViewAll}>{title}</button> }))
vi.mock('../components/catalog/CatalogFallbackBanner', () => ({ CatalogFallbackBanner: () => null }))
vi.mock('../components/catalog/CategoryPagination', () => ({ CategoryPagination: ({ onPageChange }: any) => <button onClick={() => onPageChange(2)}>Next page</button>, scrollCatalogToTop: vi.fn() }))
function Location() { return <output>{useLocation().search}</output> }
function mount(Page: typeof BrowsePage, path: string) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Page /><Location /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  requests.trending.mockImplementation(async (type, page) => ({ results: [{ id: page, title: type === 'tv' ? undefined : `Trend ${page}`, name: type === 'tv' ? `Trend ${page}` : undefined, media_type: type === 'all' ? 'movie' : type, poster_path: '/poster.jpg', vote_average: 8 }], total_pages: 12, total_results: 240 }))
  requests.discoverMovie.mockResolvedValue({ results: [], total_pages: 1, total_results: 0 })
  requests.discoverTv.mockResolvedValue({ results: [], total_pages: 1, total_results: 0 })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
for (const [Page, route, type, row] of [[BrowsePage, '/browse', 'all', 'catalog.trending'], [MoviesPage, '/movies', 'movie', 'catalog.trendingMovies'], [SeriesPage, '/series', 'tv', 'catalog.trendingSeries']] as const) {
  it(`${route} See All requests the real weekly trends and pages without reloading home`, async () => {
    mount(Page, route)
    await userEvent.click(await screen.findByRole('button', { name: row }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('?collection=trending'))
    expect(await screen.findByText('Trend 4')).toBeTruthy()
    const discoverCount = requests.discoverMovie.mock.calls.length + requests.discoverTv.mock.calls.length
    expect(discoverCount).toBe(8)
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByText('Trend 8')).toBeTruthy()
    expect(requests.trending).toHaveBeenLastCalledWith(type, 8)
    expect(requests.discoverMovie.mock.calls.length + requests.discoverTv.mock.calls.length).toBe(discoverCount)
  })
  it(`${route} normalizes legacy trending links without discovering a genre`, async () => {
    mount(Page, `${route}?genre=trending`)
    expect(await screen.findByText('Trend 4')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('?collection=trending'))
    expect(requests.discoverMovie).not.toHaveBeenCalled()
    expect(requests.discoverTv).not.toHaveBeenCalled()
  })
}
it('batches and caps actual trending API pagination', async () => {
  const result = await catalogApi.browse({ collection: 'trending', type: 'series', page: 125, limit: 80 })
  expect(requests.trending.mock.calls).toEqual([['tv', 497], ['tv', 498], ['tv', 499], ['tv', 500]])
  expect(result.meta.pagination).toEqual({ page: 125, limit: 80, total: 240, pages: 3 })
  expect(requests.discoverTv).not.toHaveBeenCalled()
})

it('keeps movie and TV trends that share the same numeric TMDB id', async () => {
  requests.trending.mockResolvedValue({ results: [
    { id: 1, media_type: 'movie', title: 'Film', poster_path: '/a.jpg', vote_average: 8 },
    { id: 1, media_type: 'tv', name: 'Show', poster_path: '/b.jpg', vote_average: 8 },
  ], total_pages: 1, total_results: 2 })
  const result = await catalogApi.browse({ collection: 'trending', limit: 20 })
  expect(result.data.map(item => item.type)).toEqual(['movie', 'series'])
  expect(new Set(result.data.map(item => item.id)).size).toBe(2)
})
it('retries a failed trends view at the selected page', async () => {
  mount(MoviesPage, '/movies?collection=trending')
  await screen.findByText('Trend 4')
  requests.trending.mockRejectedValueOnce(new Error('offline'))
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await userEvent.click(await screen.findByRole('button', { name: 'common.retry' }))
  expect(await screen.findByText('Trend 8')).toBeTruthy()
  expect(requests.trending).toHaveBeenLastCalledWith('movie', 8)
  expect(requests.discoverMovie).not.toHaveBeenCalled()
})
