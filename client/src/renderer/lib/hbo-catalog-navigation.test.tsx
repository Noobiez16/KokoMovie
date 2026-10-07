// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { catalogApi } from '../api/catalog'
import { GenreNavigation } from '../components/catalog/GenreNavigation'
import { ContentCard } from '../components/catalog/ContentCard'
import { ContentRow } from '../components/catalog/ContentRow'
const locale = vi.hoisted(() => ({ language: 'en' }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => ({ es: { 'catalog.genres.action': 'Acción', 'catalog.genres.comedy': 'Comedia', 'catalog.genres.sciFi': 'Ciencia ficción' }, fr: { 'catalog.genres.action': 'Action', 'catalog.genres.comedy': 'Comédie', 'catalog.genres.sciFi': 'Science-fiction' } } as Record<string, Record<string, string>>)[locale.language]?.[key] ?? key, i18n: { language: locale.language } }) }))
vi.mock('../api/catalog', () => ({ catalogApi: { getGenres: vi.fn().mockResolvedValue({ data: [{ id: 'science-fiction', name: 'Science Fiction', slug: 'science-fiction' }] }) } }))
const item = { id: 'tv-11', title: 'Resume Show', type: 'series' as const, releaseYear: 2026, rating: null, imdbScore: null, durationMins: null, s3Thumbnail: '/poster.jpg', backdropUrl: '/backdrop.jpg', imdbId: null, tmdbId: 11, planMinimum: 'basic', positionSeconds: 120, durationSeconds: 300, episodeId: 'ep-11-1-2' }
function Probe() { return <output data-testid="nav-state">{JSON.stringify(useLocation().state)}</output> }
afterEach(() => { cleanup(); vi.restoreAllMocks(); locale.language = 'en' })
for (const [path, active] of [['/movies', 'catalog.featured'], ['/movies?collection=trending', 'catalog.trending'], ['/movies?genre=science-fiction', 'Science Fiction']] as const) {
  it(`uses returned genre routes and active selection at ${path}`, async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><GenreNavigation type="movie" /></MemoryRouter></QueryClientProvider>)
    const genre = await screen.findByRole('link', { name: 'Science Fiction' })
    expect(genre.getAttribute('href')).toBe('/movies?genre=science-fiction')
    expect(screen.getByRole('link', { name: active }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'catalog.trending' }).getAttribute('href')).toBe('/movies?collection=trending')
  })
}
it('keeps episode resume state and backdrop on a landscape card', async () => {
  const { container } = render(<MemoryRouter><ContentCard variant="landscape" content={item} /><Probe /></MemoryRouter>)
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/backdrop.jpg')
  await userEvent.click(screen.getByRole('button', { name: item.title }))
  expect(JSON.parse(screen.getByTestId('nav-state').textContent!)).toMatchObject({ resumePosition: 120, resumeEpisodeId: 'ep-11-1-2' })
})
for (const reduced of [false, true]) {
  it(`supports keyboard row arrows with reduced motion ${reduced}`, async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
    const scrollBy = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', { configurable: true, value: scrollBy })
    render(<MemoryRouter><ContentRow title="Resume" items={[item]} variant="landscape" /></MemoryRouter>)
    screen.getByRole('button', { name: 'Resume: common.next' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(scrollBy).toHaveBeenCalledWith({ left: expect.any(Number), behavior: reduced ? 'auto' : 'smooth' })
    vi.unstubAllGlobals()
  })
}

it('links real genres to the series category and tolerates an optional genre failure', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { unmount } = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/series?genre=science-fiction']}><GenreNavigation type="series" /></MemoryRouter></QueryClientProvider>)
  expect((await screen.findByRole('link', { name: 'Science Fiction' })).getAttribute('href')).toBe('/series?genre=science-fiction')
  unmount()
  vi.mocked(catalogApi.getGenres).mockRejectedValueOnce(new Error('offline'))
  const offlineClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={offlineClient}><MemoryRouter><GenreNavigation type="movie" /><h1>Available catalog</h1></MemoryRouter></QueryClientProvider>)
  await waitFor(() => expect(offlineClient.getQueryCache().getAll()[0]?.state.status).toBe('error'))
  expect(screen.getByRole('link', { name: 'catalog.featured' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Available catalog' })).toBeTruthy()
})
it('removes a landscape item through its sibling action without navigating', async () => {
  const onRemove = vi.fn()
  render(<MemoryRouter><ContentCard variant="landscape" content={item} onRemove={onRemove} /><Probe /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: 'catalog.removeContinue' }))
  expect(onRemove).toHaveBeenCalledWith(item.id)
  expect(screen.getByTestId('nav-state').textContent).toBe('null')
})
it('updates known genre labels on locale changes and preserves unknown supplied labels and routes', async () => {
  vi.mocked(catalogApi.getGenres).mockResolvedValue({ success: true, data: [
    { id: 'action', name: 'Action', slug: 'action' },
    { id: 'comedy', name: 'Comedy', slug: 'comedy' },
    { id: 'sci-fi', name: 'Sci-Fi', slug: 'sci-fi' },
    { id: 'science-fiction', name: 'Science Fiction', slug: 'science-fiction' },
  ] })
  locale.language = 'es'
  const client = new QueryClient()
  const view = () => <QueryClientProvider client={client}><MemoryRouter><GenreNavigation type="movie" /></MemoryRouter></QueryClientProvider>
  const { rerender } = render(view())
  expect((await screen.findByRole('link', { name: 'Acción' })).getAttribute('href')).toBe('/movies?genre=action')
  expect(screen.getByRole('link', { name: 'Ciencia ficción' }).getAttribute('href')).toBe('/movies?genre=sci-fi')
  expect(screen.getByRole('link', { name: 'Science Fiction' }).getAttribute('href')).toBe('/movies?genre=science-fiction')
  locale.language = 'fr'
  rerender(view())
  expect((await screen.findByRole('link', { name: 'Comédie' })).getAttribute('href')).toBe('/movies?genre=comedy')
  expect(screen.getByRole('link', { name: 'Science-fiction' }).getAttribute('href')).toBe('/movies?genre=sci-fi')
  expect(screen.getByRole('link', { name: 'Science Fiction' })).toBeTruthy()
})
