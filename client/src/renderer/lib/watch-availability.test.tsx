// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WhereToWatch } from '../components/catalog/WhereToWatch'
import { watchAvailabilityApi, safeWatchLink } from '../api/watch-availability'
import { useSettingsStore } from '../store/settings'
import { tmdbCatalogSource, createTmdbClient, tmdbContentId } from './tmdb'
import i18n from '../i18n'

const movie = tmdbContentId('movie', 603)
const tv = tmdbContentId('tv', 1399)
const countries = [{ iso_3166_1: 'US', english_name: 'United States', native_name: 'United States' }, { iso_3166_1: 'FR', english_name: 'France', native_name: 'France' }]
const provider = (id: number, name: string, priority = 1, logo = '/logo.jpg') => ({ provider_id: id, provider_name: name, display_priority: priority, logo_path: logo })
const availability = { id: 603, results: { US: { link: 'https://www.themoviedb.org/movie/603/watch?locale=US', flatrate: [provider(2, 'Later', 9), provider(1, 'First'), provider(1, 'Duplicate'), provider(-1, 'Invalid')], free: [provider(3, 'Free service')], ads: [provider(4, 'Ad service')], rent: [provider(1, 'First')], buy: [provider(5, 'Buy service')] }, FR: { link: 'https://www.themoviedb.org/movie/603/watch?locale=FR', rent: [provider(6, 'France rental')] } } }
const tmdbRequest = vi.fn()
function response(body: unknown, source = 'network', stale = false) { return { body: JSON.stringify(body), source, stale, fetchedAt: '2026-10-07T00:00:00Z' } }
function mount(contentId = movie) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return render(<WhereToWatch contentId={contentId} />, { wrapper })
}
async function choose(country = 'US') {
  await screen.findByRole('option', { name: 'United States' })
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Country' }), country)
}
beforeEach(async () => {
  await i18n.changeLanguage('en-US')
  localStorage.clear()
  useSettingsStore.setState({ tmdbApiKey: 'key', watchCountry: '' })
  tmdbRequest.mockReset().mockImplementation(async (path: string) => response(path === '/configuration/countries' ? countries : availability))
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { tmdbRequest } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Where to watch at the renderer IPC boundary', () => {
  it('starts unset without inferring a country or requesting providers', async () => {
    mount()
    await screen.findByRole('option', { name: 'United States' })
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('')
    expect(screen.getByText('Choose a country to see viewing options.')).toBeTruthy()
    expect(tmdbRequest.mock.calls.map(([path]) => path)).toEqual(['/configuration/countries'])
  })
  it('does not request remote data without a key or valid content identity', async () => {
    useSettingsStore.setState({ tmdbApiKey: '' })
    const view = mount()
    expect(tmdbRequest).not.toHaveBeenCalled()
    view.unmount()
    useSettingsStore.setState({ tmdbApiKey: 'key' })
    mount('invalid')
    expect(tmdbRequest).not.toHaveBeenCalled()
  })
  it('persists explicit selection and renders sorted deduplicated access groups, attribution and safe link', async () => {
    const view = mount()
    await choose()
    await screen.findByText('Free service')
    expect(tmdbRequest).toHaveBeenCalledWith('/movie/603/watch/providers', { language: 'en-US' })
    const subscription = screen.getByRole('group', { name: 'Subscription' })
    expect(within(subscription).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['First', 'Later'])
    for (const group of ['Free', 'With ads', 'Rent', 'Buy']) expect(screen.getByRole('group', { name: group })).toBeTruthy()
    expect(screen.queryByText('Invalid')).toBeNull()
    expect(screen.getByText('Availability data: JustWatch via TMDB.')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'View options on TMDB' }) as HTMLAnchorElement
    expect(link.href).toBe('https://www.themoviedb.org/movie/603/watch?locale=US')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
    expect(within(subscription).getAllByRole('presentation')[0].getAttribute('src')).toBe('catalog-cache://image/w185/logo.jpg')
    expect(JSON.parse(localStorage.getItem('km-settings')!).state.watchCountry).toBe('US')
    expect(localStorage.getItem('km-settings')).not.toContain('key')
    view.unmount()
    mount()
    await screen.findByText('Free service')
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('US')
  })
  it('uses the same country response map when switching countries', async () => {
    mount(); await choose(); await screen.findByText('Free service')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'FR')
    expect(await screen.findByText('France rental')).toBeTruthy()
    expect(screen.queryByText('Free service')).toBeNull()
    expect(tmdbRequest.mock.calls.filter(([path]) => path.endsWith('/watch/providers'))).toHaveLength(1)
  })
  it('does not display the previous title while loading another and routes series to TV', async () => {
    const view = mount(); await choose(); await screen.findByText('Free service')
    let finish!: (value: unknown) => void
    tmdbRequest.mockImplementation((path: string) => path === '/configuration/countries' ? Promise.resolve(response(countries)) : new Promise((resolve) => { finish = resolve }))
    view.rerender(<WhereToWatch contentId={tv} />)
    expect(screen.queryByText('Free service')).toBeNull()
    await waitFor(() => expect(tmdbRequest).toHaveBeenCalledWith('/tv/1399/watch/providers', { language: 'en-US' }))
    finish(response({ id: 1399, results: {} }))
    expect(await screen.findByText('No viewing information for this country.')).toBeTruthy()
  })
  it('describes missing country data without claiming universal unavailability', async () => {
    tmdbRequest.mockImplementation(async (path: string) => response(path === '/configuration/countries' ? countries : { id: 603, results: {} }))
    mount(); await choose()
    expect(await screen.findByText('No viewing information for this country.')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
  for (const stale of [false, true]) it(`labels ${stale ? 'outdated' : 'saved'} availability from main cache`, async () => {
    tmdbRequest.mockImplementation(async (path: string) => response(path === '/configuration/countries' ? countries : availability, 'cache', stale))
    mount(); await choose()
    expect(await screen.findByText(stale ? 'Saved information may be outdated. Confirm availability on TMDB.' : 'Saved information. Confirm current availability on TMDB.')).toBeTruthy()
  })
  it('keeps the selector after a provider error and retry actually requests again', async () => {
    let attempts = 0
    tmdbRequest.mockImplementation(async (path: string) => {
      if (path === '/configuration/countries') return response(countries)
      if (++attempts === 1) throw new Error('offline')
      return response(availability)
    })
    mount(); await choose()
    await screen.findByText('Could not load viewing options.')
    expect(screen.getByRole('combobox')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Free service')).toBeTruthy()
    expect(attempts).toBe(2)
  })
  it('retries the country list after a request failure', async () => {
    tmdbRequest.mockRejectedValueOnce(new Error('offline'))
    mount()
    await screen.findByText('Could not load countries.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('option', { name: 'United States' })
    expect(tmdbRequest).toHaveBeenCalledTimes(2)
  })
  it('rejects malicious artwork and external links without losing valid provider text', async () => {
    tmdbRequest.mockImplementation(async (path: string) => response(path === '/configuration/countries' ? countries : { id: 603, results: { US: { link: 'https://evil.example/', buy: [provider(3, 'Bad logo service', 1, 'https://evil.example/p.png')] } } }))
    mount(); await choose(); await screen.findByText('Bad logo service')
    expect(document.querySelector('img')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('validated watch availability API', () => {
  it('rejects unset country and malformed IDs before IPC', async () => {
    await expect(watchAvailabilityApi.getProviders(movie, '')).rejects.toThrow()
    await expect(watchAvailabilityApi.getProviders('bad-id', 'US')).rejects.toThrow()
    await expect(watchAvailabilityApi.getProviders(tmdbContentId('movie', 0), 'US')).rejects.toThrow()
    expect(tmdbRequest).not.toHaveBeenCalled()
  })
  it('rejects mismatched title response identities', async () => {
    tmdbRequest.mockResolvedValue(response({ ...availability, id: 604 }))
    await expect(watchAvailabilityApi.getProviders(movie, 'US')).rejects.toThrow()
  })
  it('preserves catalog fresh-cache semantics while exposing saved watch metadata', async () => {
    tmdbRequest.mockResolvedValue(response(availability, 'cache', false))
    const raw = await createTmdbClient('key').getMovieWatchProviders(603)
    expect(tmdbCatalogSource(raw)).toBe('tmdb')
    const value = await watchAvailabilityApi.getProviders(movie, 'US')
    expect(value.source).toBe('cache')
    expect(value.stale).toBe(false)
  })
  it('validates exact TMDB title, country, protocol, query and authority', () => {
    expect(safeWatchLink(availability.results.US.link, 'movie', 603, 'US')).toBe(availability.results.US.link)
    for (const link of ['https://www.themoviedb.org/tv/603/watch?locale=US', 'https://www.themoviedb.org/movie/604/watch?locale=US', 'https://www.themoviedb.org/movie/603/watch?locale=FR', 'http://www.themoviedb.org/movie/603/watch?locale=US', 'https://x@www.themoviedb.org/movie/603/watch?locale=US', 'https://www.themoviedb.org:444/movie/603/watch?locale=US', 'https://www.themoviedb.org/movie/603/watch?locale=US&redirect=https://evil.example', 'https://www.themoviedb.org/movie/603/watch?locale=US#evil', 'https://www.themoviedb.org/movie/600/../603/watch?locale=US']) expect(safeWatchLink(link, 'movie', 603, 'US')).toBeNull()
  })
})



