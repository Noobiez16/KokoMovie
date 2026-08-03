import { describe, expect, it } from 'vitest'
import { vidlinkProvider } from '../../main/providers/vidlink'
import { vixsrcProvider } from '../../main/providers/vixsrc'

describe('bundled provider URL contracts', () => {
  it('builds movie and complete TV URLs', () => {
    expect(vidlinkProvider.getEmbedUrl({ type: 'movie', tmdbId: 10 }))
      .toBe('https://vidlink.pro/movie/10')
    expect(vidlinkProvider.getEmbedUrl({ type: 'tv', tmdbId: 10, season: 2, episode: 3 }))
      .toBe('https://vidlink.pro/tv/10/2/3')
  })

  it('rejects incomplete requests', () => {
    expect(vidlinkProvider.getEmbedUrl({ type: 'movie' })).toBeNull()
    expect(vidlinkProvider.getEmbedUrl({ type: 'tv', tmdbId: 10, season: 2 })).toBeNull()
  })

  it('encodes VixSrc language preferences', () => {
    expect(vixsrcProvider.getEmbedUrl({
      type: 'tv', tmdbId: 20, season: 1, episode: 4, audioLang: 'es-MX',
    })).toBe('https://vixsrc.to/tv/20/1/4?lang=es-MX')
  })
})
