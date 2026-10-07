// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HeroBanner } from '../components/catalog/HeroBanner'
import type { ContentDetail } from '../api/catalog'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const content = { id: 'movie-1', title: 'A Film', type: 'movie', tmdbId: 12, genres: [], description: 'A story' } as unknown as ContentDetail
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
function Details() { const { state } = useLocation(); return <><h1>Details</h1><output data-testid="state">{JSON.stringify(state)}</output></> }
function mount(type: 'movie' | 'series' = 'movie', trailerKey?: string) {
  render(<MemoryRouter><Routes><Route path="/" element={<HeroBanner content={{ ...content, type, trailerKey }} />} /><Route path="/player/:id" element={<h1>Playback</h1>} /><Route path="/content/:id" element={<Details />} /></Routes></MemoryRouter>)
}
describe('hero actions', () => {
  it('starts a movie with Play', async () => { mount(); await userEvent.click(screen.getByRole('button', { name: 'common.play' })); expect(screen.getByRole('heading', { name: 'Details' })).toBeTruthy(); expect(JSON.parse(screen.getByTestId('state').textContent!)).toMatchObject({ autoPlay: true, tmdbId: 12, tmdbType: 'movie' }) })
  it('opens movie details with More Info', async () => { mount(); await userEvent.click(screen.getByRole('button', { name: 'catalog.moreInfo' })); expect(screen.getByRole('heading', { name: 'Details' })).toBeTruthy(); expect(JSON.parse(screen.getByTestId('state').textContent!)).not.toHaveProperty('autoPlay') })
  it('offers episodes for series', async () => { mount('series'); await userEvent.click(screen.getByRole('button', { name: 'ui.viewEpisodes' })); expect(screen.getByRole('heading', { name: 'Details' })).toBeTruthy(); expect(JSON.parse(screen.getByTestId('state').textContent!)).not.toHaveProperty('autoPlay') })
  it('hides mute when no trailer is available', () => { mount(); expect(screen.queryByRole('button', { name: 'common.unmute' })).toBeNull() })
  it('keeps a static backdrop for reduced motion', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    mount('movie', 'trailer-1')
    act(() => { vi.advanceTimersByTime(2500) })
    expect(screen.queryByTitle('catalog.trailer')).toBeNull()
    expect(screen.queryByRole('button', { name: 'common.unmute' })).toBeNull()
  })
  it('does not duplicate the series episode action', () => {
    mount('series')
    expect(screen.queryByRole('button', { name: 'catalog.moreInfo' })).toBeNull()
  })})



