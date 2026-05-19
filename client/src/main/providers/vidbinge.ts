import type { Provider, StreamRequest } from './interface.js'

export const vidBingeProvider: Provider = {
  id: 'vidbinge',
  name: 'VidBinge',
  sessionName: 'provider-vidbinge',

  getEmbedUrl(req: StreamRequest): string | null {
    if (req.type === 'movie') {
      if (req.imdbId) return `https://vidbinge.dev/embed/movie/${req.imdbId}`
      if (req.tmdbId) return `https://vidbinge.dev/embed/movie/${req.tmdbId}`
      return null
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      if (req.imdbId) return `https://vidbinge.dev/embed/tv/${req.imdbId}/${req.season}/${req.episode}`
      if (req.tmdbId) return `https://vidbinge.dev/embed/tv/${req.tmdbId}/${req.season}/${req.episode}`
      return null
    }
    return null
  },
}
