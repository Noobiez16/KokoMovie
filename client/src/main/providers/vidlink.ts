import type { Provider, StreamRequest } from './interface.js'

export const vidlinkProvider: Provider = {
  id: 'vidlink',
  name: 'VidLink',
  sessionName: 'provider-vidlink',

  getEmbedUrl(req: StreamRequest): string | null {
    if (!req.tmdbId) return null

    if (req.type === 'movie') {
      return `https://vidlink.pro/movie/${req.tmdbId}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://vidlink.pro/tv/${req.tmdbId}/${req.season}/${req.episode}`
    }
    return null
  },
}
