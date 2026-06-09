import type { Provider, StreamRequest } from './interface.js'

// VixSrc (vixsrc.to) — TMDB-only. Unlike the VidSrc family, VixSrc commonly serves HLS
// master manifests that carry alternate audio renditions (#EXT-X-MEDIA:TYPE=AUDIO), so the
// player's Audio menu lights up with real dub tracks when a title has them. No per-language
// URL is required for the dubs to surface (they're inside the manifest); the optional `lang`
// query just nudges which audio VixSrc marks as default. See DN-041 for why this is the only
// honest way to get dubs (the audio must actually be in the stream).
export const vixsrcProvider: Provider = {
  id: 'vixsrc',
  name: 'VixSrc',
  sessionName: 'provider-vixsrc',

  getEmbedUrl(req: StreamRequest): string | null {
    if (!req.tmdbId) return null

    const lang = req.audioLang ? `?lang=${encodeURIComponent(req.audioLang)}` : ''

    if (req.type === 'movie') {
      return `https://vixsrc.to/movie/${req.tmdbId}${lang}`
    }
    if (req.type === 'tv' && req.season != null && req.episode != null) {
      return `https://vixsrc.to/tv/${req.tmdbId}/${req.season}/${req.episode}${lang}`
    }
    return null
  },
}
