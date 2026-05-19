import type { Provider, StreamRequest } from './interface.js'

export const autoEmbedProvider: Provider = {
  id: 'autoembed',
  name: 'AutoEmbed',
  sessionName: 'provider-autoembed',

  getEmbedUrl(req: StreamRequest): string | null {
    if (req.type === 'movie') {
      if (req.imdbId) return `https://autoembed.to/movie/imdb/${req.imdbId}`
      if (req.tmdbId) return `https://autoembed.to/movie/tmdb/${req.tmdbId}`
      return null
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      if (req.imdbId) return `https://autoembed.to/tv/imdb/${req.imdbId}/${req.season}/${req.episode}`
      if (req.tmdbId) return `https://autoembed.to/tv/tmdb/${req.tmdbId}/${req.season}/${req.episode}`
      return null
    }
    return null
  },
}
