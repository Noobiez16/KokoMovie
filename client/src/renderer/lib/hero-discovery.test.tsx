// @vitest-environment jsdom
import { StrictMode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentDetailPage } from '../pages/ContentDetail'
import { catalogApi } from '../api/catalog'
import { providersApi } from '../api/providers'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../components/layout/AppLayout', () => ({ AppLayout: ({ children }: any) => children }))
vi.mock('../components/catalog/ContentRow', () => ({ ContentRow: () => null }))
vi.mock('../store/settings', () => ({ useSettingsStore: (selector: any) => selector({ tmdbApiKey: '' }) }))
vi.mock('../api/catalog', () => ({ catalogApi: { getContent: vi.fn(), syncContent: vi.fn() } }))
vi.mock('../api/providers', () => ({ providersApi: { getFirstStream: vi.fn() }, torrentApi: {} }))
vi.mock('../api/user', () => ({ userApi: { checkWatchlist: async () => ({ data: {} }) } }))
vi.mock('../api/recommendation', () => ({ recommendationApi: { getSimilar: async () => ({ data: [] }) } }))
vi.mock('../api/playback', () => ({ playbackApi: { getContinueWatching: async () => ({ data: [] }) } }))
const movie = { id: 'movie-1', type: 'movie', title: 'A Film', tmdbId: 12, imdbId: 'tt12', genres: [], cast: [], seasons: [] }
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output data-testid="state">{JSON.stringify(location.state)}</output><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button></> }
function mount(cached = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  if (cached) qc.setQueryData(['content', 'movie-1', 'local'], { data: movie })
  render(<StrictMode><QueryClientProvider client={qc}><MemoryRouter initialEntries={['/browse', { pathname: '/content/movie-1', state: { autoPlay: true, tmdbId: 12, tmdbType: 'movie' } }]} initialIndex={1}><Probe /><Routes><Route path="/content/:id" element={<ContentDetailPage />} /><Route path="/player/:id" element={<h1>Playback</h1>} /><Route path="/browse" element={<h1>Browse</h1>} /></Routes></MemoryRouter></QueryClientProvider></StrictMode>)
}
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })
describe('hero stream discovery', () => {
  it('waits for approved metadata and discovers a usable source before playback', async () => {
    let resolve!: (value: any) => void
    vi.mocked(catalogApi.getContent).mockImplementation(() => new Promise(r => { resolve = r }))
    vi.mocked(providersApi.getFirstStream).mockResolvedValue({ providerId: 'source', providerName: 'Source', streams: [{ url: 'https://example.com/film.m3u8' }], allStreams: [] } as any)
    mount()
    expect(providersApi.getFirstStream).not.toHaveBeenCalled()
    await waitFor(() => expect(resolve).toBeTypeOf('function'))
    resolve({ data: movie })
    await screen.findByRole('heading', { name: 'Playback' })
    expect(providersApi.getFirstStream).toHaveBeenCalledWith(expect.objectContaining({ title: 'A Film', imdbId: 'tt12', type: 'movie' }), expect.any(String))
    expect(JSON.parse(screen.getByTestId('state').textContent!)).toMatchObject({ streamUrl: 'https://example.com/film.m3u8', providerId: 'source' })
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('heading', { name: 'A Film' })
    expect(JSON.parse(screen.getByTestId('state').textContent!)).not.toHaveProperty('autoPlay')
    expect(providersApi.getFirstStream).toHaveBeenCalledTimes(1)
  })
  it('does not discover sources when maturity rejects the metadata', async () => {
    vi.mocked(catalogApi.getContent).mockRejectedValue(new Error('CONTENT_RESTRICTED_BY_MATURITY'))
    mount()
    await screen.findByText('detail.notFound')
    expect(providersApi.getFirstStream).not.toHaveBeenCalled()
  })
  it('consumes the launch before cancellation and never relaunches on Back and Forward', async () => {
    vi.mocked(catalogApi.getContent).mockResolvedValue({ data: movie } as any)
    let resolve!: (value: any) => void
    vi.mocked(providersApi.getFirstStream).mockImplementation(() => new Promise(r => { resolve = r }))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'player.cancelSearch' }))
    expect(JSON.parse(screen.getByTestId('state').textContent!)).not.toHaveProperty('autoPlay')
    resolve({ streams: [{ url: 'https://example.com/film.m3u8' }] })
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }))
    await screen.findByRole('heading', { name: 'A Film' })
    expect(providersApi.getFirstStream).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Playback' })).toBeNull()
  })
  it('keeps the existing CAM confirmation before playback', async () => {
    vi.mocked(catalogApi.getContent).mockResolvedValue({ data: movie } as any)
    vi.mocked(providersApi.getFirstStream).mockResolvedValue({ providerId: 'source', providerName: 'Source', streams: [{ url: 'https://example.com/cam.m3u8', qualityInfo: { releaseType: 'cam' } }] } as any)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount()
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('player.camWarning'))
    expect(screen.queryByRole('heading', { name: 'Playback' })).toBeNull()
    expect(JSON.parse(screen.getByTestId('state').textContent!)).not.toHaveProperty('autoPlay')
  })
  it('cancels pending discovery when leaving the detail route', async () => {
    vi.mocked(catalogApi.getContent).mockResolvedValue({ data: movie } as any)
    let resolve!: (value: any) => void
    vi.mocked(providersApi.getFirstStream).mockImplementation(() => new Promise(r => { resolve = r }))
    mount()
    await screen.findByRole('button', { name: 'player.cancelSearch' })
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    resolve({ streams: [{ url: 'https://example.com/film.m3u8' }] })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Browse' })).toBeTruthy())
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }))
    await screen.findByRole('heading', { name: 'A Film' })
    expect(providersApi.getFirstStream).toHaveBeenCalledTimes(1)
  })
  it('launches once with cached metadata during StrictMode effect replay', async () => {
    vi.mocked(providersApi.getFirstStream).mockResolvedValue({ providerId: 'source', streams: [{ url: 'https://example.com/film.m3u8' }] } as any)
    mount(true)
    await screen.findByRole('heading', { name: 'Playback' })
    expect(providersApi.getFirstStream).toHaveBeenCalledTimes(1)
  })})



