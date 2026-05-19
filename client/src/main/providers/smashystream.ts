import type { Provider, StreamRequest } from './interface.js'

export const smashyStreamProvider: Provider = {
  id: 'smashystream',
  name: 'SmashyStream',
  sessionName: 'provider-smashystream',

  getEmbedUrl(req: StreamRequest): string | null {
    const id = req.imdbId ?? (req.tmdbId ? String(req.tmdbId) : null)
    if (!id) return null

    if (req.type === 'movie') {
      return `https://player.smashystream.com/movie/${id}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://player.smashystream.com/tv/${id}/${req.season}/${req.episode}`
    }
    return null
  },
}
