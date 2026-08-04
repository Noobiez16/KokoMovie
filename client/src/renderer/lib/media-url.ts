// Allowlist for URLs rendered into <img src> on content pages.
//
// Inside Electron, tmdbImageUrl() emits `catalog-cache://image/<size>/<path>` so artwork is served
// from the local Phase 5 cache, and downloaded media is served over `offline://`. Both schemes are
// registered as privileged/secure in the main process and are permitted by `img-src` in the CSP.
// An earlier version of this allowlist predated both schemes and silently rejected them, which
// blanked every image on the detail page.
//
// This stays an allowlist: anything not explicitly listed — `javascript:`, `vbscript:`, `file:`,
// arbitrary `data:` payloads that are not images — resolves to an empty string.
const ALLOWED_MEDIA_URL = /^(?:https?:\/\/|catalog-cache:\/\/|offline:\/\/|data:image\/)/i

export function sanitizeMediaUrl(url: string | null | undefined): string {
  if (!url) return ''
  const trimmed = url.trim()
  // Relative paths stay within the packaged renderer origin.
  if (trimmed.startsWith('/')) return trimmed
  return ALLOWED_MEDIA_URL.test(trimmed) ? trimmed : ''
}
