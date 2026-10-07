// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, useLocation } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { GlobalSearch } from '../components/layout/GlobalSearch'
import { LibraryMenu } from '../components/layout/LibraryMenu'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })
function Contents() {
  const location = useLocation()
  return <><output data-testid="location">{location.pathname + location.search}</output>{location.pathname === '/search' && <GlobalSearch />}<button>Outside</button></>
}
function setup(path = '/browse', state?: unknown) {
  return render(<MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.includes('?') ? '?' + path.split('?')[1] : '', state }]}><AppLayout><Contents /></AppLayout></MemoryRouter>)
}
describe('platform navigation', () => {
  it('cancels the closing timer when reopened before 160ms', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const scheduled = vi.spyOn(globalThis, 'setTimeout')
    const cancelled = vi.spyOn(globalThis, 'clearTimeout')
    const { container } = render(<MemoryRouter><LibraryMenu /></MemoryRouter>)
    const toggle = screen.getByRole('button', { name: 'ui.libraryMenu' })
    fireEvent.click(toggle)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('.km-menu-panel')?.getAttribute('data-closing')).toBe('true')
    const closeCall = scheduled.mock.calls.findIndex(([, delay]) => delay === 160)
    expect(closeCall).toBeGreaterThanOrEqual(0)
    const closeTimer = scheduled.mock.results[closeCall].value
    cancelled.mockClear()
    act(() => vi.advanceTimersByTime(80))
    fireEvent.click(toggle)
    expect(cancelled).toHaveBeenCalledWith(closeTimer)
    act(() => vi.advanceTimersByTime(160))
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('link', { name: 'history.myList' })).toBeTruthy()
    expect(container.querySelector('.km-menu-panel')?.getAttribute('data-closing')).toBe('false')
  })
  it('clears the closing panel and timer immediately on navigation', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const scheduled = vi.spyOn(globalThis, 'setTimeout')
    const cancelled = vi.spyOn(globalThis, 'clearTimeout')
    const { container } = render(<MemoryRouter><LibraryMenu /><Contents /><Link to="/downloads">Navigate</Link></MemoryRouter>)
    const toggle = screen.getByRole('button', { name: 'ui.libraryMenu' })
    fireEvent.click(toggle)
    fireEvent.keyDown(document, { key: 'Escape' })
    const closeCall = scheduled.mock.calls.findIndex(([, delay]) => delay === 160)
    expect(closeCall).toBeGreaterThanOrEqual(0)
    const closeTimer = scheduled.mock.results[closeCall].value
    cancelled.mockClear()
    fireEvent.click(screen.getByRole('link', { name: 'Navigate' }))
    expect(screen.getByTestId('location').textContent).toBe('/downloads')
    expect(container.querySelector('.km-menu-panel')).toBeNull()
    expect(cancelled).toHaveBeenCalledWith(closeTimer)
    act(() => vi.advanceTimersByTime(160))
    expect(container.querySelector('.km-menu-panel')).toBeNull()
  })
  it('cancels a closing timer on unmount before mounting a new disclosure', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const scheduled = vi.spyOn(globalThis, 'setTimeout')
    const cancelled = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = render(<MemoryRouter><LibraryMenu /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'ui.libraryMenu' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    const closeCall = scheduled.mock.calls.findIndex(([, delay]) => delay === 160)
    expect(closeCall).toBeGreaterThanOrEqual(0)
    const closeTimer = scheduled.mock.results[closeCall].value
    cancelled.mockClear()
    unmount()
    expect(cancelled).toHaveBeenCalledWith(closeTimer)
    render(<MemoryRouter><LibraryMenu /></MemoryRouter>)
    const toggle = screen.getByRole('button', { name: 'ui.libraryMenu' })
    fireEvent.click(toggle)
    act(() => vi.advanceTimersByTime(160))
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('link', { name: 'history.myList' })).toBeTruthy()
  })
  it('reveals all existing local destinations and distinguishes list from history', async () => {
    const user = userEvent.setup(); setup('/history?tab=list')
    await user.click(screen.getByRole('button', { name: 'ui.libraryMenu' }))
    for (const [label, href] of [['history.myList', '/history?tab=list'], ['catalog.continueWatching', '/continue-watching'], ['nav.history', '/history'], ['nav.downloads', '/downloads'], ['nav.providers', '/providers'], ['nav.settings', '/settings']]) {
      expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe(href)
    }
    expect(screen.getByRole('link', { name: 'history.myList' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'nav.history' }).getAttribute('aria-current')).toBeNull()
  })
  it('returns focus after Escape closes the disclosure', async () => {
    const user = userEvent.setup(); setup()
    const toggle = screen.getByRole('button', { name: 'ui.libraryMenu' })
    await user.click(toggle); await user.tab(); await user.keyboard('{Escape}')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle)
    expect(screen.queryByRole('link', { name: 'history.myList' })).toBeNull()
  })
  it('closes on outside interaction and navigation', async () => {
    const user = userEvent.setup(); setup()
    const toggle = screen.getByRole('button', { name: 'ui.libraryMenu' })
    await user.click(toggle); await user.click(screen.getByText('Outside'))
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await user.click(toggle); await user.click(screen.getByRole('link', { name: 'nav.downloads' }))
    expect(screen.getByTestId('location').textContent).toBe('/downloads')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })
  it.each([['/movies', undefined, 'nav.movies'], ['/series', undefined, 'nav.series'], ['/content/00000002-0000-4000-8000-00000000002a', undefined, 'nav.series'], ['/content/42', { tmdbType: 'movie' }, 'nav.movies']])('marks the primary destination for %s', (path, state, label) => {
    setup(path as string, state)
    expect(screen.getByRole('link', { name: label as string }).getAttribute('aria-current')).toBe('page')
  })
  it.each([
    ['/content/00000001-0000-4000-8000-00000000002a', undefined, 'nav.movies'],
    ['/content/00000002-0000-4000-8000-00000000002a', undefined, 'nav.series'],
    ['/content/local-movie', { tmdbType: 'movie' }, 'nav.movies'],
    ['/content/local-series', { tmdbType: 'tv' }, 'nav.series'],
    ['/content/local-unknown', undefined, undefined],
  ])('shares detail active state in desktop and disclosure for %s', async (path, state, activeLabel) => {
    const user = userEvent.setup(); setup(path, state)
    await user.click(screen.getByRole('button', { name: 'ui.libraryMenu' }))
    const navigations = screen.getAllByRole('navigation', { name: 'ui.mainNavigation' })
    expect(navigations).toHaveLength(2)
    for (const navigation of navigations) {
      for (const label of ['nav.home', 'nav.movies', 'nav.series']) {
        expect(within(navigation).getByRole('link', { name: label }).getAttribute('aria-current')).toBe(label === activeLabel ? 'page' : null)
      }
    }
  })
  it('keeps search out of the shell and exposes a search link', async () => {
    const user = userEvent.setup(); setup()
    expect(screen.queryByRole('searchbox')).toBeNull()
    await user.click(screen.getByRole('link', { name: 'nav.search' }))
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  })
  it.each(['{Control>}k{/Control}', '{Meta>}k{/Meta}'])('navigates and focuses Search with %s', async (keys) => {
    const user = userEvent.setup(); setup()
    await user.keyboard(keys)
    expect(screen.getByTestId('location').textContent).toBe('/search')
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
    await user.click(screen.getByText('Outside')); await user.keyboard(keys)
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  })
  it('encodes search text and preserves selected type while resetting page', async () => {
    const user = userEvent.setup(); setup('/search?q=Alien&type=movie&page=2')
    const input = screen.getByRole('searchbox')
    expect((input as HTMLInputElement).value).toBe('Alien')
    await user.clear(input); await user.type(input, 'Wall-E & friends{Enter}')
    expect(screen.getByTestId('location').textContent).toBe('/search?q=Wall-E+%26+friends&type=movie')
    expect((input as HTMLInputElement).value).toBe('Wall-E & friends')
  })
})
