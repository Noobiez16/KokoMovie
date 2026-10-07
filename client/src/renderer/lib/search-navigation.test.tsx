// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { SearchPage } from '../pages/Search'
import { catalogApi } from '../api/catalog'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../api/catalog', () => ({ catalogApi: { search: vi.fn().mockResolvedValue({ success: true, data: [], meta: { pages: 3, total: 60 } }) } }))
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
afterEach(() => { cleanup(); vi.clearAllMocks() })
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output data-testid="url">{location.search}</output><button onClick={() => navigate(-1)}>Go back</button></> }
function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SearchPage /><Probe /></MemoryRouter></QueryClientProvider>)
}
describe('search navigation', () => {
  it('enters only valid results and remounts the entry for same-route type and page changes', async () => {
    const user = userEvent.setup()
    mount('/search?q=Alien')
    await screen.findByRole('button', { name: 'catalog.nextPage' })
    const first = document.querySelector('.km-search-results.km-data-enter')
    expect(first).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'catalog.nextPage' }))
    await waitFor(() => expect(document.querySelector('.km-search-results.km-data-enter')).not.toBe(first))
    const second = document.querySelector('.km-search-results.km-data-enter')
    expect(second).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'nav.movies' }))
    await waitFor(() => expect(catalogApi.search).toHaveBeenLastCalledWith('Alien', { type: 'movie', page: 1 }, 'local'))
    await waitFor(() => expect(document.querySelector('.km-search-results.km-data-enter')).not.toBeNull())
    expect(document.querySelector('.km-search-results.km-data-enter')).not.toBe(second)
    await user.clear(screen.getByRole('searchbox'))
    expect(document.querySelector('.km-data-enter')).toBeNull()
  })
  it('does not enter stale results while a new query is debouncing or awaiting data', async () => {
    const user = userEvent.setup()
    let resolve!: (value: any) => void
    vi.mocked(catalogApi.search).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    mount('/search?q=Alien')
    await waitFor(() => expect(catalogApi.search).toHaveBeenCalled())
    expect(document.querySelector('.km-data-enter')).toBeNull()
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'Sintel')
    await act(async () => resolve({ data: [], meta: { pages: 1 } }))
    expect(document.querySelector('.km-data-enter')).toBeNull()
    await waitFor(() => expect(catalogApi.search).toHaveBeenLastCalledWith('Sintel', { type: undefined, page: 1 }, 'local'))
    await waitFor(() => expect(document.querySelector('.km-search-results.km-data-enter')).not.toBeNull())
  })
  it('uses one URL-hydrated search field and requests the next actual page', async () => {
    const user = userEvent.setup()
    mount('/search?q=Interstellar')
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Interstellar')
    await user.click(await screen.findByRole('button', { name: 'catalog.nextPage' }))
    await waitFor(() => expect(catalogApi.search).toHaveBeenLastCalledWith('Interstellar', { page: 2, type: undefined }, 'local'))
  })
  it('resets pagination on a type change and restores it with Back', async () => {
    const user = userEvent.setup()
    mount('/search?q=Alien&page=3')
    await waitFor(() => expect(catalogApi.search).toHaveBeenCalledWith('Alien', { page: 3, type: undefined }, 'local'))
    await user.click(screen.getByRole('button', { name: 'nav.movies' }))
    await waitFor(() => expect(catalogApi.search).toHaveBeenLastCalledWith('Alien', { page: 1, type: 'movie' }, 'local'))
    expect(screen.getByTestId('url').textContent).toContain('type=movie')
    await user.click(screen.getByText('Go back'))
    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('page=3'))
    expect(screen.getByRole('button', { name: 'ui.allTitles' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('resets pagination when typing a new query', async () => {
    const user = userEvent.setup()
    mount('/search?q=Alien&page=3')
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'Sintel')
    await waitFor(() => expect(catalogApi.search).toHaveBeenLastCalledWith('Sintel', { page: 1, type: undefined }, 'local'))
    expect(screen.getByTestId('url').textContent).not.toContain('page=3')
  })
})
