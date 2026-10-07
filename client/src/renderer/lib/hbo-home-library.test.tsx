// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BrowsePage } from '../pages/Browse'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../store/settings', () => ({ useSettingsStore: (select: any) => select({ tmdbApiKey: 'key', tmdbKeyHydrated: true }) }))
vi.mock('../api/catalog', () => ({ catalogApi: { getHome: vi.fn().mockRejectedValue(new Error('offline')) } }))
vi.mock('../api/playback', () => ({ playbackApi: { getContinueWatching: vi.fn().mockResolvedValue({ data: [] }) } }))
vi.mock('../api/user', () => ({ userApi: { getWatchlist: vi.fn().mockResolvedValue({ data: [{ contentId: 'tmdb-movie-12', contentType: 'movie', title: 'Saved film', s3Thumbnail: '/saved.jpg', releaseYear: 2025 }] }) } }))
afterEach(cleanup)
it('keeps the real enriched My List available when the online home fails', async () => {
 render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><BrowsePage /></MemoryRouter></QueryClientProvider>)
 expect(await screen.findByRole('heading', { name: 'history.myList' })).toBeTruthy()
 expect(screen.getByRole('button', { name: 'Saved film' })).toBeTruthy()
 expect(screen.getByRole('main').getAttribute('data-overlay')).toBe('false')
})
