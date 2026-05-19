import type { Provider, StreamRequest } from './interface.js'

export const vidsrcSuProvider: Provider = {
  id: 'vidsrc-su',
  name: 'VidSrc.su',
  sessionName: 'provider-vidsrc-su',

  getEmbedUrl(req: StreamRequest): string | null {
    if (req.type === 'movie') {
      if (req.imdbId) return `https://vidsrc.su/embed/movie/${req.imdbId}`
      if (req.tmdbId) return `https://vidsrc.su/embed/movie/${req.tmdbId}`
      return null
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      if (req.imdbId) return `https://vidsrc.su/embed/tv/${req.imdbId}/${req.season}/${req.episode}`
      if (req.tmdbId) return `https://vidsrc.su/embed/tv/${req.tmdbId}/${req.season}/${req.episode}`
      return null
    }
    return null
  },
}
