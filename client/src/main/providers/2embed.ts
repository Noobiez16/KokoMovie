import type { Provider, StreamRequest } from './interface.js'

export const twoEmbedProvider: Provider = {
  id: '2embed',
  name: '2Embed',
  sessionName: 'provider-2embed',

  getEmbedUrl(req: StreamRequest): string | null {
    const id = req.imdbId ?? (req.tmdbId ? String(req.tmdbId) : null)
    if (!id) return null

    if (req.type === 'movie') {
      return `https://www.2embed.cc/embed/${id}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://www.2embed.cc/embedtv/${id}?s=${req.season}&e=${req.episode}`
    }
    return null
  },
}
