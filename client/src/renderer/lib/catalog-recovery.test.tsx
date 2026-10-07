// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BrowsePage } from '../pages/Browse'
import { MoviesPage } from '../pages/Movies'
import { SeriesPage } from '../pages/Series'
import { ContinueWatchingPage } from '../pages/ContinueWatching'
import { catalogApi } from '../api/catalog'
import { playbackApi } from '../api/playback'
vi.mock('../components/layout/AppLayout', () => ({ AppLayout: ({ children }: any) => children }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: any) => options?.number ? `${key} ${options.number}` : key }) }))
vi.mock('../store/settings', () => ({ useSettingsStore: (select: any) => select({ tmdbApiKey: 'key', tmdbKeyHydrated: true }) }))
vi.mock('../api/catalog', () => ({ catalogApi: { getHome: vi.fn(), browse: vi.fn() } }))
vi.mock('../api/playback', () => ({ playbackApi: { getContinueWatching: vi.fn(), removeFromContinueWatching: vi.fn() } }))
vi.mock('../components/catalog/HeroBanner', () => ({ HeroBanner: ({ content }: any) => <h2>{content.title}</h2> }))
vi.mock('../components/catalog/ContentCard', () => ({ ContentCard: ({ content }: any) => <h2>{content.title}</h2> }))
vi.mock('../components/catalog/ContentRow', () => ({ ContentRow: ({ items }: any) => <div>{items.map((item: any) => <h2 key={item.id}>{item.title}</h2>)}</div> }))
vi.mock('../components/catalog/CatalogFallbackBanner', () => ({ CatalogFallbackBanner: () => null }))
vi.mock('../components/catalog/CategoryPagination', () => ({ CategoryPagination: ({ onPageChange }: any) => <button onClick={() => onPageChange(2)}>Next page</button>, scrollCatalogToTop: vi.fn() }))
const recovered = { id: 'recovered', title: 'Recovered title' }
const resume = { contentId: 'series-1', title: 'Local series', type: 'series', releaseYear: 2026, episodeId: 'ep-12-2-3', contentEpisodeId: 'series-1:ep-12-2-3', positionSeconds: 30, durationSeconds: 100, s3Thumbnail: null, backdropUrl: null }
function mount(Page: typeof BrowsePage, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Page /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => { vi.mocked(playbackApi.getContinueWatching).mockResolvedValue({ success: true, data: [] }) })
afterEach(() => { cleanup(); vi.resetAllMocks() })
describe('catalog recovery', () => {
  for (const [Page, path, type] of [[BrowsePage, '/browse', undefined], [MoviesPage, '/movies', 'movie'], [SeriesPage, '/series', 'series']] as const) {
    it(`retries ${path} home without losing the current route`, async () => {
      vi.mocked(catalogApi.getHome).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: { featured: recovered, trending: [], rows: [] } } as any)
      mount(Page, path)
      await userEvent.click(await screen.findByRole('button', { name: 'common.retry' }))
      expect(await screen.findByText('Recovered title')).toBeTruthy()
      expect(catalogApi.getHome).toHaveBeenLastCalledWith(type ? { type } : {}, 'local')
    })
    it(`retries ${path} genre at the selected page`, async () => {
      vi.mocked(catalogApi.browse).mockResolvedValueOnce({ data: [recovered], meta: { pagination: { pages: 2 } } } as any).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: [recovered] } as any)
      mount(Page, `${path}?genre=drama`)
      await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
      await userEvent.click(await screen.findByRole('button', { name: 'common.retry' }))
      expect(await screen.findByText('Recovered title')).toBeTruthy()
      expect(catalogApi.browse).toHaveBeenLastCalledWith({ ...(type ? { type } : {}), genre: 'drama', limit: 80, page: 2 }, 'local')
    })
  }
  it('keeps local continue watching accessible alongside a recoverable home error', async () => {
    vi.mocked(playbackApi.getContinueWatching).mockResolvedValue({ success: true, data: [resume] } as any)
    vi.mocked(catalogApi.getHome).mockRejectedValue(new Error('offline'))
    mount(BrowsePage, '/browse')
    expect(await screen.findByText('Local series')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'common.retry' })).toBeTruthy()
  })
  it('renders translated season and episode labels instead of an internal episode identifier', async () => {
    vi.mocked(playbackApi.getContinueWatching).mockResolvedValue({ success: true, data: [resume] } as any)
    mount(ContinueWatchingPage, '/continue-watching')
    await screen.findByText('Local series')
    expect(screen.getByText(/detail.season 2.*detail.episode 3/)).toBeTruthy()
    expect(screen.queryByText(/ep-12-2-3/)).toBeNull()
  })
  it('uses a generic series label for an unrecognized episode identifier', async () => {
    vi.mocked(playbackApi.getContinueWatching).mockResolvedValue({ success: true, data: [{ ...resume, episodeId: 'legacy-episode' }] } as any)
    mount(ContinueWatchingPage, '/continue-watching')
    await waitFor(() => expect(screen.getByText(/common.series/)).toBeTruthy())
    expect(screen.queryByText(/legacy-episode/)).toBeNull()
  })
})
