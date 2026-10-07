// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { GlobalSearch } from './GlobalSearch'
import { catalogApi, type ContentSummary } from '../../api/catalog'
import { userApi } from '../../api/user'
const locale = { language: 'en-US' }
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: locale }) }))
vi.mock('../../api/catalog', () => ({ catalogApi: { search: vi.fn() } }))
vi.mock('../../api/user', () => ({ userApi: { getPreferences: vi.fn() } }))
function item(title: string, id = title): ContentSummary {
  return { id, title, type: 'series', tmdbId: 42, releaseYear: 2026, rating: null, imdbScore: null, durationMins: null, s3Thumbnail: '/poster.jpg', backdropUrl: null, imdbId: null, planMinimum: 'basic' }
}
function result(...items: ContentSummary[]): Awaited<ReturnType<typeof catalogApi.search>> { return { success: true, data: items, meta: { query: '', page: 1, total: items.length, pages: 1, source: 'tmdb', requestId: '00000000-0000-4000-8000-000000000000', timestamp: '' } } }
function Probe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output data-testid="location">{JSON.stringify(location)}</output><button onClick={() => navigate('/browse?genre=action')}>Change genre</button><button onClick={() => navigate(-1)}>Back</button></>
}
function mount(path = '/browse') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppLayout>{path === '/search' && <GlobalSearch />}<button>Outside</button><Probe /></AppLayout></MemoryRouter></QueryClientProvider>)
  return { client }
}
async function open() { await userEvent.click(screen.getByRole('button', { name: 'nav.search' })); return screen.getByRole('combobox') }
beforeEach(() => {
  locale.language = 'en-US'
  vi.mocked(userApi.getPreferences).mockResolvedValue({ success: true, data: { language: 'en-US', maturityRating: 'TV-MA', autoplay: false, subtitleDefault: null, isKids: false, sourceDiscoveryMode: 'progressive' } })
  vi.mocked(catalogApi.search).mockResolvedValue(result(item('First')))
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })
describe('inline header search', () => {
  it('opens and focuses in place, waits 300ms and requires two characters', async () => {
    mount(); const input = await open()
    expect(document.activeElement).toBe(input)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.change(input, { target: { value: 'a' } })
    await act(async () => vi.advanceTimersByTime(400))
    expect(catalogApi.search).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'Alien' } })
    await act(async () => vi.advanceTimersByTime(299))
    expect(catalogApi.search).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))
    expect(catalogApi.search).toHaveBeenCalledWith('Alien', { page: 1 }, 'local')
    expect(screen.getByTestId('location').textContent).toContain('/browse')
  })
  it('hides previous matches throughout debounce and an out-of-order pending response', async () => {
    let resolveOld!: (value: ReturnType<typeof result>) => void
    vi.mocked(catalogApi.search).mockResolvedValueOnce(result(item('First'))).mockImplementationOnce(() => new Promise(done => { resolveOld = done })).mockResolvedValueOnce(result(item('Fresh')))
    mount(); const input = await open()
    fireEvent.change(input, { target: { value: 'first' } })
    await screen.findByRole('option', { name: /First/ })
    fireEvent.change(input, { target: { value: 'slow' } })
    expect(screen.queryByRole('option')).toBeNull()
    await waitFor(() => expect(catalogApi.search).toHaveBeenCalledWith('slow', { page: 1 }, 'local'))
    fireEvent.change(input, { target: { value: 'fresh' } })
    await act(async () => resolveOld(result(item('Old'))))
    expect(screen.queryByRole('option')).toBeNull()
    await screen.findByRole('option', { name: /Fresh/ })
    expect(screen.queryByText('Old')).toBeNull()
  })
  it('caps suggestions at eight and navigates to selected detail with catalog identity', async () => {
    vi.mocked(catalogApi.search).mockResolvedValue(result(...Array.from({ length: 10 }, (_, i) => item('Title ' + i, 'local-' + i))))
    mount(); const input = await open()
    fireEvent.change(input, { target: { value: 'title' } })
    await screen.findByRole('option', { name: /Title 0/ })
    expect(screen.getAllByRole('option')).toHaveLength(8)
    fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('location').textContent).toContain('/content/local-1')
    expect(screen.getByTestId('location').textContent).toContain('"tmdbType":"tv"')
    expect(screen.queryByRole('combobox')).toBeNull()
  })
  it('restores trigger focus with Escape but keeps outside click and tab destinations focused', async () => {
    mount(); let input = await open()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'nav.search' }))
    input = await open(); await userEvent.click(screen.getByText('Outside'))
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(document.activeElement).toBe(screen.getByText('Outside'))
    input = await open(); await userEvent.tab()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ui.libraryMenu' }))
  })
  it('closes the library panel when the search shortcut moves focus into inline search', async () => {
    mount(); const menu = screen.getByRole('button', { name: 'ui.libraryMenu' })
    await userEvent.click(menu)
    expect(menu.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
    expect(menu.getAttribute('aria-expanded')).toBe('false')
  })
  it('clears the disclosure on same-page navigation and browser Back', async () => {
    mount(); let input = await open()
    fireEvent.change(input, { target: { value: 'title' } }); await screen.findByRole('option')
    fireEvent.click(screen.getByText('Change genre'))
    expect(screen.queryByRole('combobox')).toBeNull()
    input = await open()
    expect((input as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByText('Back'))
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByTestId('location').textContent).toContain('"search":""')
  })
  it('retries errors and announces empty results', async () => {
    vi.mocked(catalogApi.search).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(result())
    mount(); const input = await open(); fireEvent.change(input, { target: { value: 'none' } })
    await userEvent.click(await screen.findByRole('button', { name: 'common.retry' }))
    await screen.findByText('catalog.noResultsFor')
    expect(catalogApi.search).toHaveBeenCalledTimes(2)
  })
  it.each(['ctrlKey', 'metaKey'])('opens on %s+K without navigation and focuses the legacy input on /search', async (modifier) => {
    mount('/settings'); fireEvent.keyDown(window, { key: 'k', [modifier]: true })
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
    expect(screen.getByTestId('location').textContent).toContain('/settings')
    cleanup(); mount('/search')
    expect(screen.queryByRole('button', { name: 'nav.search' })).toBeNull()
    fireEvent.keyDown(window, { key: 'k', [modifier]: true })
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  })
  it('suppresses cached matches while maturity preferences refresh and after locale changes', async () => {
    const { client } = mount(); const input = await open()
    fireEvent.change(input, { target: { value: 'title' } }); await screen.findByRole('option')
    let finish!: (value: Awaited<ReturnType<typeof userApi.getPreferences>>) => void
    vi.mocked(userApi.getPreferences).mockImplementationOnce(() => new Promise(done => { finish = done }))
    act(() => { void client.invalidateQueries({ queryKey: ['preferences', 'local'] }) })
    await waitFor(() => expect(screen.queryByRole('option')).toBeNull())
    vi.mocked(catalogApi.search).mockResolvedValueOnce(result(item('Allowed')))
    await act(async () => finish({ success: true, data: { language: 'en-US', maturityRating: 'PG', autoplay: false, subtitleDefault: null, isKids: false, sourceDiscoveryMode: 'progressive' } }))
    await screen.findByRole('option', { name: /Allowed/ })
    vi.mocked(catalogApi.search).mockResolvedValueOnce(result(item('Français')))
    locale.language = 'fr-FR'; fireEvent.change(input, { target: { value: 'title ' } })
    expect(screen.queryByText('Allowed')).toBeNull()
    await screen.findByRole('option', { name: /Français/ })
  })
})
