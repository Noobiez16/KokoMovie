// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ContentDetailPage } from '../pages/ContentDetail'
import { catalogApi } from '../api/catalog'
import { providersApi, torrentApi } from '../api/providers'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: any) => options?.number !== undefined ? `${key} ${options.number}` : key }) }))
vi.mock('../components/layout/AppLayout', () => ({ AppLayout: ({ children }: any) => children }))
vi.mock('../components/catalog/ContentRow', () => ({ ContentRow: () => null }))
vi.mock('../store/settings', () => ({ useSettingsStore: (select: any) => select({ tmdbApiKey: '' }) }))
vi.mock('../api/catalog', () => ({ catalogApi: { getContent: vi.fn(), getSeason: vi.fn() } }))
vi.mock('../api/providers', () => ({ providersApi: { getFirstStream: vi.fn(), list: vi.fn() }, torrentApi: { getStreams: vi.fn() } }))
vi.mock('../api/user', () => ({ userApi: { checkWatchlist: async () => ({ data: {} }) } }))
vi.mock('../api/recommendation', () => ({ recommendationApi: { getSimilar: async () => ({ data: [] }) } }))
vi.mock('../api/playback', () => ({ playbackApi: { getContinueWatching: async () => ({ data: [] }) } }))
const episode = (number: number, title: string) => ({ id: `ep-${number}`, contentId: 'series', seasonId: 's2', episodeNumber: number, title, description: 'Real synopsis', durationMins: 42, s3ThumbnailKey: null })
const seasons = [{ id: 's1', contentId: 'series', seasonNumber: 1, title: null, overview: null, episodes: [episode(1, 'First season episode')] }, { id: 's2', contentId: 'series', seasonNumber: 2, title: 'Winter', overview: null, episodes: [] }]
const content = { id: 'series', type: 'series', title: 'Real series', imdbId: 'tt12', tmdbId: 12, genres: [], cast: [], seasons }
function mount(value: any = content) {
  vi.mocked(catalogApi.getContent).mockResolvedValue({ data: value } as any)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/content/series']}><Routes><Route path="/content/:id" element={<ContentDetailPage />} /><Route path="/player/:id/:episodeId" element={<h1>Playback</h1>} /></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.mocked(catalogApi.getSeason).mockResolvedValue({ data: { ...seasons[1], episodes: [episode(3, 'Winter episode')] } } as any)
  vi.mocked(providersApi.list).mockResolvedValue([])
  vi.mocked(providersApi.getFirstStream).mockResolvedValue({ providerId: 'source', streams: [{ url: 'https://example.com/episode.m3u8' }] } as any)
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('enters ready episodes while keeping a delayed season loader unanimated and correctly identified', async () => {
  let resolve!: (value: any) => void
  vi.mocked(catalogApi.getSeason).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  mount()
  const first = await screen.findByRole('button', { name: 'First season episode' })
  expect(first.closest('[role="tabpanel"]')?.classList.contains('km-data-enter')).toBe(true)
  await userEvent.click(screen.getByRole('tab', { name: 'detail.season 2 — Winter' }))
  await waitFor(() => expect(catalogApi.getSeason).toHaveBeenCalledWith('series', 2))
  const loading = screen.getByRole('tabpanel')
  expect(loading.getAttribute('data-season-number')).toBe('2')
  expect(loading.getAttribute('aria-busy')).toBe('true')
  expect(loading.classList.contains('km-data-enter')).toBe(false)
  expect(screen.queryByRole('button', { name: 'First season episode' })).toBeNull()
  await act(async () => resolve({ data: { ...seasons[1], episodes: [episode(3, 'Winter episode')] } }))
  const ready = (await screen.findByRole('button', { name: 'Winter episode' })).closest('[role="tabpanel"]')
  expect(ready).not.toBe(loading)
  expect(ready?.classList.contains('km-data-enter')).toBe(true)
  expect(ready?.getAttribute('aria-busy')).toBe('false')
})
it('selects and demands the actual season with keyboard, then plays its actual episode', async () => {
  mount()
  const first = await screen.findByRole('tab', { name: 'detail.season 1' })
  first.focus()
  await userEvent.keyboard('{ArrowRight}')
  const second = screen.getByRole('tab', { name: 'detail.season 2 — Winter' })
  expect(document.activeElement).toBe(second)
  await waitFor(() => expect(second.getAttribute('aria-selected')).toBe('true'))
  expect(await screen.findByRole('button', { name: 'Winter episode' })).toBeTruthy()
  expect(catalogApi.getSeason).toHaveBeenCalledWith('series', 2)
  expect(screen.queryByRole('button', { name: 'First season episode' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Winter episode' }))
  await screen.findByRole('heading', { name: 'Playback' })
  expect(providersApi.getFirstStream).toHaveBeenCalledWith(expect.objectContaining({ season: 2, episode: 3, title: 'Real series' }), expect.any(String))
})
it('Home and End keep the selected season and focus together', async () => {
  mount()
  const first = await screen.findByRole('tab', { name: 'detail.season 1' })
  first.focus()
  await userEvent.keyboard('{End}')
  await screen.findByRole('button', { name: 'Winter episode' })
  await userEvent.keyboard('{Home}')
  expect(document.activeElement).toBe(first)
  expect(first.getAttribute('aria-selected')).toBe('true')
  expect(screen.getByRole('button', { name: 'First season episode' })).toBeTruthy()
  await userEvent.keyboard('{ArrowLeft}')
  expect(screen.getByRole('tab', { name: 'detail.season 2 — Winter' }).getAttribute('aria-selected')).toBe('true')
})
it('keeps episode download separate from playback and opens the preserved picker', async () => {
  mount()
  await screen.findByRole('button', { name: 'First season episode' })
  const download = screen.getByRole('button', { name: 'common.download · First season episode' })
  expect(download.parentElement?.closest('button')).toBeNull()
  await userEvent.click(download)
  expect(await screen.findByText('detail.chooseDownloadSource')).toBeTruthy()
  expect(torrentApi.getStreams).toHaveBeenCalledWith(expect.objectContaining({ title: 'Real series', season: 1, episode: 1 }))
  expect(providersApi.getFirstStream).not.toHaveBeenCalled()
})
it('keeps a single season accessible and omits tabs for absent seasons', async () => {
  mount({ ...content, seasons: [seasons[0]] })
  const tab = await screen.findByRole('tab', { name: 'detail.season 1' })
  tab.focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(tab.getAttribute('aria-selected')).toBe('true')
  cleanup()
  mount({ ...content, seasons: [] })
  await screen.findByRole('heading', { name: 'Real series' })
  expect(screen.queryByRole('tablist')).toBeNull()
})
