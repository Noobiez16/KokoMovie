import type { Provider, StreamRequest } from './interface.js'

export const multiembedProvider: Provider = {
  id: 'multiembed',
  name: 'MultiEmbed',
  sessionName: 'provider-multiembed',

  getEmbedUrl(req: StreamRequest): string | null {
    const id = req.imdbId ?? (req.tmdbId ? String(req.tmdbId) : null)
    if (!id) return null

    if (req.type === 'movie') {
      return `https://multiembed.mov/get.php?video_id=${id}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://multiembed.mov/get.php?video_id=${id}&s=${req.season}&e=${req.episode}`
    }
    return null
  },
}
