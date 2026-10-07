// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}
function setup(path = '/browse') {
  return render(<MemoryRouter initialEntries={[path]}><AppLayout><LocationProbe /></AppLayout></MemoryRouter>)
}
describe('platform navigation', () => {
  it('keeps the chosen navigation size across page layouts', async () => {
    const user = userEvent.setup()
    const first = setup()
    await user.click(screen.getByRole('button', { name: 'ui.collapseNavigation' }))
    first.unmount()
    setup('/downloads')
    expect(screen.getByRole('button', { name: 'ui.expandNavigation' }).getAttribute('aria-expanded')).toBe('false')
  })
  it('starts compact on a narrow window but permits explicit expansion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'ui.expandNavigation' }))
    expect(screen.getByRole('button', { name: 'ui.collapseNavigation' }).getAttribute('aria-expanded')).toBe('true')
  })
  it('makes local library destinations directly available', () => {
    setup()
    expect(screen.getByRole('link', { name: 'history.myList' }).getAttribute('href')).toBe('/history?tab=list')
    expect(screen.getByRole('link', { name: 'catalog.continueWatching' }).getAttribute('href')).toBe('/continue-watching')
    expect(screen.getByRole('link', { name: 'nav.history' }).getAttribute('href')).toBe('/history')
    expect(screen.getAllByRole('link', { name: 'nav.downloads' }).some((link) => link.getAttribute('href') === '/downloads')).toBe(true)
  })
  it('distinguishes list and history despite their shared pathname', () => {
    setup('/history?tab=list')
    expect(screen.getByRole('link', { name: 'history.myList' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'nav.history' }).getAttribute('aria-current')).toBeNull()
  })
  it('encodes a search and keeps its value after submitting', async () => {
    const user = userEvent.setup()
    setup()
    const input = screen.getByRole('searchbox')
    await user.type(input, 'Wall-E & friends{Enter}')
    expect(screen.getByTestId('location').textContent).toBe('/search?q=Wall-E+%26+friends')
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Wall-E & friends')
  })
  it('hydrates the global search from the URL', () => {
    setup('/search?q=Interstellar')
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Interstellar')
  })
  it('preserves the selected type when submitting an existing search', async () => {
    const user = userEvent.setup()
    setup('/search?q=Alien&type=movie&page=2')
    await user.type(screen.getByRole('searchbox'), '{Enter}')
    expect(screen.getByTestId('location').textContent).toContain('type=movie')
    expect(screen.getByTestId('location').textContent).not.toContain('page=2')
  })
})
