// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { HeroBanner } from '../components/catalog/HeroBanner'
import { ResponsiveArtwork } from '../components/catalog/ResponsiveArtwork'
import type { ContentSummary } from '../api/catalog'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const cached = 'catalog-cache://image/w1280/backdrop.jpg'
let width = 3440
let height = 922
let resizeCallbacks: Array<() => void> = []
let disconnect: ReturnType<typeof vi.fn>

function mount(src = cached, trailerKey?: string) {
  const content = { id: 'artwork-film', title: 'A Film', type: 'movie', backdropUrl: src, trailerKey } as ContentSummary
  return render(<MemoryRouter><HeroBanner content={content} /></MemoryRouter>)
}
function image(container: HTMLElement) { return container.querySelector('img')! }
function resize() { act(() => { resizeCallbacks.forEach(callback => callback()); window.dispatchEvent(new Event('resize')) }) }

beforeEach(() => {
  width = 3440; height = 922; resizeCallbacks = []; disconnect = vi.fn()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON() {} }))
  vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeCallbacks.push(callback) }
    observe() {}
    disconnect = disconnect
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('responsive fullscreen artwork', () => {
  it('tracks the contained artwork width in CSS pixels across frame and density changes', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const { container } = mount()
    const artworkWidth = () => parseFloat(image(container).style.getPropertyValue('--km-artwork-width'))
    expect(artworkWidth()).toBeCloseTo(height * 16 / 9)
    width = 960; height = 800
    resize()
    expect(artworkWidth()).toBe(width)
    vi.stubGlobal('devicePixelRatio', 1)
    width = 2000; height = 600
    resize()
    expect(artworkWidth()).toBeCloseTo(height * 16 / 9)
  })
  it('aligns the feather width with the loaded source aspect and resets for the next source', () => {
    width = 2000; height = 800
    const { container, rerender } = render(<div><ResponsiveArtwork src={cached} className="km-detail-artwork km-hero-artwork" /></div>)
    const artworkWidth = () => parseFloat(image(container).style.getPropertyValue('--km-artwork-width'))
    Object.defineProperties(image(container), { naturalWidth: { value: 800 }, naturalHeight: { value: 1200 } })
    fireEvent.load(image(container))
    expect(artworkWidth()).toBeCloseTo(height * 2 / 3)
    rerender(<div><ResponsiveArtwork src="/next.jpg" className="km-detail-artwork km-hero-artwork" /></div>)
    expect(artworkWidth()).toBeCloseTo(height * 16 / 9)
  })
  it('uses a full-width feather fallback for a zero-size frame and updates once measurable', () => {
    width = 0; height = 0
    const { container } = mount()
    expect(image(container).style.getPropertyValue('--km-artwork-width')).toBe('100%')
    width = 3440; height = 922
    resize()
    expect(parseFloat(image(container).style.getPropertyValue('--km-artwork-width'))).toBeCloseTo(height * 16 / 9)
    height = 0
    resize()
    expect(image(container).style.getPropertyValue('--km-artwork-width')).toBe('100%')
  })
  it('upgrades the contained ultrawide artwork through the catalog cache', () => {
    const { container } = mount()
    expect(image(container).getAttribute('src')).toBe('catalog-cache://image/original/backdrop.jpg')
  })
  it('keeps w1280 when the contained picture fits, then responds to density and container changes', () => {
    width = 1440; height = 600
    const { container } = mount()
    expect(image(container).getAttribute('src')).toBe(cached)
    vi.stubGlobal('devicePixelRatio', 2)
    resize()
    expect(image(container).getAttribute('src')).toContain('/original/')
    vi.stubGlobal('devicePixelRatio', 1)
    width = 1024; height = 490
    resize()
    expect(image(container).getAttribute('src')).toBe(cached)
  })
  it('uses the actual loaded aspect ratio when sizing non-widescreen artwork', () => {
    width = 2000; height = 800
    const { container } = mount()
    Object.defineProperties(image(container), { naturalWidth: { value: 800 }, naturalHeight: { value: 1200 } })
    fireEvent.load(image(container))
    expect(image(container).getAttribute('src')).toBe(cached)
  })
  it('falls back to the existing cached image once without looping on errors or resize', () => {
    const { container } = mount()
    expect(image(container).getAttribute('src')).toContain('/original/')
    fireEvent.error(image(container))
    expect(image(container).getAttribute('src')).toBe(cached)
    fireEvent.error(image(container)); resize()
    expect(image(container).getAttribute('src')).toBe(cached)
  })
  it('allows the next content image to upgrade after a failed previous image', () => {
    const { container, rerender } = mount()
    fireEvent.error(image(container))
    rerender(<MemoryRouter><HeroBanner content={{ id: 'next', title: 'Next', type: 'movie', backdropUrl: 'catalog-cache://image/w1280/next.jpg' } as ContentSummary} /></MemoryRouter>)
    expect(image(container).getAttribute('src')).toBe('catalog-cache://image/original/next.jpg')
  })
  it('upgrades only official HTTPS TMDB images', () => {
    const { container } = mount('https://image.tmdb.org/t/p/w1280/backdrop.jpg')
    expect(image(container).getAttribute('src')).toBe('https://image.tmdb.org/t/p/original/backdrop.jpg')
  })
  it.each([
    'offline://download/artwork.jpg', 'blob:https://app.local/image', '/custom/backdrop.jpg',
    'https://custom.example/w1280/backdrop.jpg', 'https://image.tmdb.org.evil.example/t/p/w1280/backdrop.jpg',
    'https://user@image.tmdb.org/t/p/w1280/backdrop.jpg', 'https://image.tmdb.org/t/p/w1280/backdrop.jpg?token=abc',
    'catalog-cache://image/w1280/../backdrop.jpg', 'catalog-cache://image/w500/backdrop.jpg',
  ])('preserves custom/offline/untrusted input %s', src => {
    const { container } = mount(src)
    expect(image(container).getAttribute('src')).toBe(src)
  })
  it('disconnects container observers and removes the density resize listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = mount()
    unmount()
    expect(disconnect).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })
  it('fits the trailer inside the ultrawide hero without zooming', () => {
    vi.useFakeTimers()
    const { container } = mount(cached, 'trailer')
    act(() => { vi.advanceTimersByTime(2000) })
    const trailer = container.querySelector('iframe')!
    expect(parseFloat(trailer.style.width)).toBeCloseTo(height * 16 / 9)
    expect(parseFloat(trailer.style.height)).toBe(height)
    expect(trailer.className).not.toContain('scale-')
    expect(trailer.style.right).toBe('0px')
  })
  it('fits a trailer inside a portrait container', () => {
    width = 1440; height = 1800
    vi.useFakeTimers()
    const { container } = mount(cached, 'trailer')
    act(() => { vi.advanceTimersByTime(2000) })
    const trailer = container.querySelector('iframe')!
    expect(parseFloat(trailer.style.width)).toBe(width)
    expect(parseFloat(trailer.style.height)).toBe(width * 9 / 16)
  })
})
