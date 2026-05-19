import type { Provider, StreamRequest } from './interface.js'

export const moviesApiProvider: Provider = {
  id: 'moviesapi',
  name: 'MoviesAPI',
  sessionName: 'provider-moviesapi',

  getEmbedUrl(req: StreamRequest): string | null {
    if (!req.tmdbId) return null

    if (req.type === 'movie') {
      return `https://moviesapi.to/movie/${req.tmdbId}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://moviesapi.to/tv/${req.tmdbId}-${req.season}-${req.episode}`
    }
    return null
  },
}
