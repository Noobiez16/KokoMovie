import i18n from '../i18n'
import { useSettingsStore } from '../store/settings'
import { createTmdbClient, decodeTmdbContentId, profileUrl, tmdbResponseMetadata } from '../lib/tmdb'

export const WATCH_GROUPS = ['flatrate', 'free', 'ads', 'rent', 'buy'] as const
export type WatchGroup = typeof WATCH_GROUPS[number]
export interface WatchProvider { id: number; name: string; logo: string | null; priority: number }
export interface WatchCountry { code: string; name: string }
export interface WatchRegion { link: string | null; groups: Record<WatchGroup, WatchProvider[]> }
export interface WatchAvailability {
  regions: Record<string, WatchRegion>
  source: 'network' | 'cache'
  stale: boolean
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null
}
function positiveId(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647 }
export function watchIdentity(contentId: string) {
  const decoded = decodeTmdbContentId(contentId)
  return decoded && positiveId(decoded.tmdbId) ? decoded : null
}

// A provider result only grants navigation to the matching TMDB landing page.
export function safeWatchLink(value: unknown, type: 'movie' | 'tv', id: number, country: string): string | null {
  if (typeof value !== 'string' || !positiveId(id) || !/^[A-Z]{2}$/.test(country)) return null
  try {
    const url = new URL(value)
    if (value !== url.href || url.protocol !== 'https:' || url.hostname !== 'www.themoviedb.org' || url.username || url.password || url.port || url.hash ||
      url.pathname !== `/${type}/${id}/watch` || url.search !== `?locale=${country}`) return null
    return url.href
  } catch { return null }
}
function providers(value: unknown): WatchProvider[] {
  if (!Array.isArray(value)) return []
  const valid: WatchProvider[] = []
  for (const entry of value) {
    const row = record(entry)
    const name = text(row?.provider_name)
    if (!row || !positiveId(row.provider_id) || !name) continue
    // TMDB artwork is one opaque filename; never pass arbitrary URLs/protocols
    // or traversal into the artwork cache.
    const path = typeof row.logo_path === 'string' && /^\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp)$/.test(row.logo_path) ? row.logo_path : null
    const priority = typeof row.display_priority === 'number' && Number.isSafeInteger(row.display_priority) && row.display_priority >= 0 ? row.display_priority : Number.MAX_SAFE_INTEGER
    valid.push({ id: row.provider_id, name, logo: profileUrl(path), priority })
  }
  valid.sort((a, b) => a.priority - b.priority)
  const seen = new Set<number>()
  return valid.filter((provider) => { if (seen.has(provider.id)) return false; seen.add(provider.id); return true })
}
function client() {
  const key = useSettingsStore.getState().tmdbApiKey.trim()
  if (!key) throw new Error('TMDB_KEY_MISSING')
  return createTmdbClient(key, i18n.language)
}
export const watchAvailabilityApi = {
  getCountries: async (): Promise<WatchCountry[]> => {
    const raw = await client().getCountries()
    if (!Array.isArray(raw)) throw new Error('Invalid country response')
    const countries = new Map<string, WatchCountry>()
    for (const entry of raw) {
      const row = record(entry)
      if (typeof row?.iso_3166_1 !== 'string' || !/^[A-Z]{2}$/.test(row.iso_3166_1)) continue
      const name = text(row.native_name) ?? text(row.english_name)
      if (name) countries.set(row.iso_3166_1, { code: row.iso_3166_1, name })
    }
    if (!countries.size) throw new Error('Invalid country response')
    return [...countries.values()].sort((a, b) => a.name.localeCompare(b.name, i18n.language))
  },
  getProviders: async (contentId: string, country: string): Promise<WatchAvailability> => {
    const identity = watchIdentity(contentId)
    if (!identity || !/^[A-Z]{2}$/.test(country)) throw new Error('Invalid availability request')
    const c = client()
    const raw = identity.type === 'movie' ? await c.getMovieWatchProviders(identity.tmdbId) : await c.getTvWatchProviders(identity.tmdbId)
    const payload = record(raw)
    const results = record(payload?.results)
    if (payload?.id !== identity.tmdbId || !results) throw new Error('Invalid availability response')
    const regions: Record<string, WatchRegion> = {}
    for (const [code, value] of Object.entries(results)) {
      const region = record(value)
      if (!/^[A-Z]{2}$/.test(code) || !region) continue
      const groups = Object.fromEntries(WATCH_GROUPS.map((group) => [group, providers(region[group])])) as Record<WatchGroup, WatchProvider[]>
      regions[code] = { link: safeWatchLink(region.link, identity.type, identity.tmdbId, code), groups }
    }
    return { regions, ...tmdbResponseMetadata(raw) }
  },
}
