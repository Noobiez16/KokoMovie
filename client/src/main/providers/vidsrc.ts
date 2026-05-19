import type { Provider, StreamRequest } from './interface.js'

// VidSrc supports both IMDB and TMDB IDs
// Primary domain: vidsrc.to — if unavailable, use vidsrc.me (TMDB only)
export const vidsrcProvider: Provider = {
  id: 'vidsrc',
  name: 'VidSrc',
  sessionName: 'provider-vidsrc',

  getEmbedUrl(req: StreamRequest): string | null {
    if (req.type === 'movie') {
      // Prefer IMDB ID — better coverage on vidsrc.to
      if (req.imdbId) return `https://vidsrc.to/embed/movie/${req.imdbId}`
      if (req.tmdbId) return `https://vidsrc.to/embed/movie/${req.tmdbId}`
      return null
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      if (req.imdbId) return `https://vidsrc.to/embed/tv/${req.imdbId}/${req.season}/${req.episode}`
      if (req.tmdbId) return `https://vidsrc.to/embed/tv/${req.tmdbId}/${req.season}/${req.episode}`
      return null
    }
    return null
  },
}

// vidsrc.me uses TMDB ID via query params — separate provider entry
export const vidsrcMeProvider: Provider = {
  id: 'vidsrc-me',
  name: 'VidSrc.me',
  sessionName: 'provider-vidsrc-me',

  getEmbedUrl(req: StreamRequest): string | null {
    if (!req.tmdbId) return null

    if (req.type === 'movie') {
      return `https://vidsrc.me/embed/movie?tmdb=${req.tmdbId}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://vidsrc.me/embed/tv?tmdb=${req.tmdbId}&season=${req.season}&episode=${req.episode}`
    }
    return null
  },
}
