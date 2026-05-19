import type { Provider, StreamRequest } from './interface.js'

export const vidsrcPmProvider: Provider = {
  id: 'vidsrc-pm',
  name: 'VidSrc.pm',
  sessionName: 'provider-vidsrc-pm',

  getEmbedUrl(req: StreamRequest): string | null {
    if (req.type === 'movie') {
      if (req.imdbId) return `https://vidsrc.pm/embed/movie/${req.imdbId}`
      if (req.tmdbId) return `https://vidsrc.pm/embed/movie/${req.tmdbId}`
      return null
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      if (req.imdbId) return `https://vidsrc.pm/embed/tv/${req.imdbId}/${req.season}/${req.episode}`
      if (req.tmdbId) return `https://vidsrc.pm/embed/tv/${req.tmdbId}/${req.season}/${req.episode}`
      return null
    }
    return null
  },
}
