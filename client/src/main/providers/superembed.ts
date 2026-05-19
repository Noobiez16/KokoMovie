import type { Provider, StreamRequest } from './interface.js'

export const superEmbedProvider: Provider = {
  id: 'superembed',
  name: 'SuperEmbed',
  sessionName: 'provider-superembed',

  getEmbedUrl(req: StreamRequest): string | null {
    if (!req.tmdbId) return null

    if (req.type === 'movie') {
      return `https://multiembed.mov/?video_id=${req.tmdbId}&tmdb=1`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://multiembed.mov/?video_id=${req.tmdbId}&tmdb=1&s=${req.season}&e=${req.episode}`
    }
    return null
  },
}
