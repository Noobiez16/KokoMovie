// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BrowsePage } from '../pages/Browse'
import { userApi } from '../api/user'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../store/settings', () => ({ useSettingsStore: (select: any) => select({ tmdbApiKey: 'key', tmdbKeyHydrated: true }) }))
vi.mock('../api/catalog', () => ({ catalogApi: { getHome: vi.fn().mockRejectedValue(new Error('offline')) } }))
vi.mock('../api/playback', () => ({ playbackApi: { getContinueWatching: vi.fn().mockResolvedValue({ data: [{ contentId: 'tmdb-movie-12', type: 'movie', title: 'Resume film', s3Thumbnail: '/resume.jpg', releaseYear: 2025, positionSeconds: 90, durationSeconds: 600 }] }) } }))
vi.mock('../api/user', () => ({ userApi: { getWatchlist: vi.fn().mockResolvedValue({ data: [{ contentId: 'tmdb-movie-12', contentType: 'movie', title: 'Saved film', s3Thumbnail: '/saved.jpg', releaseYear: 2025 }] }) } }))
afterEach(cleanup)
it('keeps one real Continue Watching row when online home fails without querying saved titles', async () => {
 render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><BrowsePage /></MemoryRouter></QueryClientProvider>)
 expect(await screen.findByRole('heading', { name: 'catalog.continueWatching' })).toBeTruthy()
 expect(screen.getByRole('button', { name: 'Resume film' })).toBeTruthy()
 expect(screen.getAllByRole('heading', { name: 'catalog.continueWatching' })).toHaveLength(1)
 expect(screen.queryByRole('heading', { name: 'history.myList' })).toBeNull()
 expect(userApi.getWatchlist).not.toHaveBeenCalled()
 expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('15')
 expect(screen.getByRole('main').getAttribute('data-overlay')).toBe('false')
})
