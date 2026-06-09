import type { Provider, StreamRequest } from './interface.js'

// Indra Embed (indraembed.netlify.app) — TMDB-only "multi-audio" player. Like VixSrc, any
// dub it has lives inside the HLS manifest (no per-language URL), so the player's Audio menu
// surfaces it automatically when present. Marked experimental (defaultEnabled: false): it's a
// community Netlify deploy whose uptime/domain is less proven than the core providers, so it
// stays off until a user opts in via Settings → Providers (see DN-017).
export const indraProvider: Provider = {
  id: 'indra',
  name: 'Indra (Multi-Audio)',
  sessionName: 'provider-indra',
  defaultEnabled: false,

  getEmbedUrl(req: StreamRequest): string | null {
    if (!req.tmdbId) return null

    if (req.type === 'movie') {
      return `https://indraembed.netlify.app/movie/${req.tmdbId}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://indraembed.netlify.app/tv/${req.tmdbId}/${req.season}/${req.episode}`
    }
    return null
  },
}
