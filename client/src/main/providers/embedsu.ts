import type { Provider, StreamRequest } from './interface.js'

export const embedSuProvider: Provider = {
  id: 'embedsu',
  name: 'Embed.su',
  sessionName: 'provider-embedsu',

  getEmbedUrl(req: StreamRequest): string | null {
    if (!req.tmdbId) return null

    if (req.type === 'movie') {
      return `https://embed.su/embed/movie/${req.tmdbId}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://embed.su/embed/tv/${req.tmdbId}/${req.season}/${req.episode}`
    }
    return null
  },
}
