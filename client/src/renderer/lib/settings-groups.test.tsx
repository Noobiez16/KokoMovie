// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsPage } from '../pages/Settings'
import { userApi } from '../api/user'
vi.mock('../components/layout/AppLayout', () => ({ AppLayout: ({ children }: any) => children }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }) }))
vi.mock('../i18n/LocaleBootstrap', () => ({ createBrowserLocaleDependencies: vi.fn() }))
vi.mock('../api/user', () => ({ userApi: { getPreferences: vi.fn().mockResolvedValue({ data: { language: 'en-US', subtitleDefault: null, autoplay: true, maturityRating: 'TV-MA', isKids: false, sourceDiscoveryMode: 'progressive' } }), updatePreferences: vi.fn().mockResolvedValue({ success: true }) } }))
const exportFile = vi.fn().mockResolvedValue({ cancelled: true })
const selectImport = vi.fn().mockResolvedValue({ cancelled: false, token: 'import-token', preview: { watchlist: 2, positions: 1, artwork: 0, watchlistConflicts: 0, positionConflicts: 0 } })
const applyImport = vi.fn().mockResolvedValue({ success: true })
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><SettingsPage /></QueryClientProvider>) }
beforeEach(() => { window.electronAPI = { getDefaultDownloadsDir: vi.fn().mockResolvedValue('Downloads'), exportLibraryFile: exportFile, selectLibraryImport: selectImport, applyLibraryImport: applyImport } as any })
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })
describe('Settings groups', () => {
  it('opens working import and export controls from Library', async () => {
    const user = userEvent.setup(); mount()
    await screen.findByRole('heading', { name: 'settings.playback' })
    await user.click(screen.getByRole('button', { name: 'nav.library' }))
    expect(screen.getByRole('heading', { name: 'settings.portableLibrary' })).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: 'settings.includeArtwork' }))
    await user.click(screen.getByRole('button', { name: 'settings.export' }))
    expect(exportFile).toHaveBeenCalledWith({ includeArtwork: true })
    await user.click(screen.getByRole('button', { name: 'settings.import' }))
    await user.click(await screen.findByRole('button', { name: 'settings.mergeNewest' }))
    expect(applyImport).toHaveBeenCalledWith({ token: 'import-token', mode: 'merge' })
    await user.click(screen.getByRole('button', { name: 'ui.advanced' }))
    expect(screen.queryByRole('button', { name: 'settings.import' })).toBeNull()
    expect(screen.getByRole('button', { name: 'settings.clearCache' })).toBeTruthy()
  })
  it('preserves Languages and Playback controls in preferences', async () => {
    const user = userEvent.setup(); mount()
    expect(await screen.findByRole('heading', { name: 'ui.languages' })).toBeTruthy()
    await user.click(screen.getAllByRole('combobox')[0])
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map(option => option.textContent)).toEqual(['English', 'Español', 'Français'])
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'settings.autoplay' }))
    await waitFor(() => expect(userApi.updatePreferences).toHaveBeenCalledWith({ autoplay: false }, 'local'))
  })
})





