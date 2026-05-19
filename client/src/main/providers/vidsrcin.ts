import type { Provider, StreamRequest } from './interface.js'

export const vidsrcInProvider: Provider = {
  id: 'vidsrc-in',
  name: 'VidSrc.in',
  sessionName: 'provider-vidsrc-in',

  getEmbedUrl(req: StreamRequest): string | null {
    if (req.type === 'movie') {
      if (req.imdbId) return `https://vidsrc.in/embed/movie/${req.imdbId}`
      if (req.tmdbId) return `https://vidsrc.in/embed/movie/${req.tmdbId}`
      return null
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      if (req.imdbId) return `https://vidsrc.in/embed/tv/${req.imdbId}/${req.season}/${req.episode}`
      if (req.tmdbId) return `https://vidsrc.in/embed/tv/${req.tmdbId}/${req.season}/${req.episode}`
      return null
    }
    return null
  },
}
