import type { Provider, StreamRequest } from './interface.js'

export const vidsrcccProvider: Provider = {
  id: 'vidsrccc',
  name: 'VidSrc.cc',
  sessionName: 'provider-vidsrccc',

  getEmbedUrl(req: StreamRequest): string | null {
    const id = req.imdbId ?? (req.tmdbId ? String(req.tmdbId) : null)
    if (!id) return null

    if (req.type === 'movie') {
      return `https://vidsrc.cc/v2/embed/movie/${id}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://vidsrc.cc/v2/embed/tv/${id}/${req.season}/${req.episode}`
    }
    return null
  },
}
