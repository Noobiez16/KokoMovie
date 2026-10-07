// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ContentDetailPage } from '../pages/ContentDetail'
import { catalogApi } from '../api/catalog'
import { useSettingsStore } from '../store/settings'
import { tmdbContentId } from './tmdb'
import i18n from '../i18n'

vi.mock('../components/layout/AppLayout', () => ({ AppLayout: ({ children }: any) => children }))
vi.mock('../components/catalog/ContentRow', () => ({ ContentRow: () => null }))
vi.mock('../api/catalog', () => ({ catalogApi: { getContent: vi.fn() } }))
vi.mock('../api/user', () => ({ userApi: { checkWatchlist: async () => ({ data: {} }) } }))
vi.mock('../api/recommendation', () => ({ recommendationApi: { getSimilar: async () => ({ data: [] }) } }))
vi.mock('../api/playback', () => ({ playbackApi: { getContinueWatching: async () => ({ data: [] }) } }))
const tmdbRequest = vi.fn().mockResolvedValue({ body: '[]', source: 'network', stale: false })

beforeEach(async () => {
  await i18n.changeLanguage('en-US')
  useSettingsStore.setState({ tmdbApiKey: 'fixture-key' })
  tmdbRequest.mockClear()
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { tmdbRequest } })
})
afterEach(() => { cleanup(); useSettingsStore.setState({ tmdbApiKey: '' }); vi.clearAllMocks() })

it.each(['movie', 'tv'] as const)('renders %s detail without country or watch-provider queries', async (type) => {
  const id = tmdbContentId(type, 603)
  vi.mocked(catalogApi.getContent).mockResolvedValue({ data: {
    id, type: type === 'tv' ? 'series' : 'movie', title: 'Detail fixture', tmdbId: 603,
    genres: [], cast: [], seasons: [],
  } } as any)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/content/${id}`]}>
    <Routes><Route path="/content/:id" element={<ContentDetailPage />} /></Routes>
  </MemoryRouter></QueryClientProvider>)

  await screen.findByRole('heading', { name: 'Detail fixture' })
  expect(tmdbRequest.mock.calls.filter(([path]) => path === '/configuration/countries' || path.endsWith('/watch/providers'))).toEqual([])
  expect(screen.queryByRole('heading', { name: 'Where to watch' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Country' })).toBeNull()
})
