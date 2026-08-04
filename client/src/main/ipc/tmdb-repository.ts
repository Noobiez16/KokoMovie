import { ipcMain, net } from 'electron'
import { clearArtworkCache, getArtworkCacheStats } from '../catalog-artwork'
import { z } from 'zod'
import { getDb } from '../db/sqlite'
import { getTmdbCredential, storeTmdbCredential } from './auth'
import { assertTrustedRenderer, tmdbCredentialSchema } from './security'
import { findCachedTmdbItem, mergeTmdbItems, downloadedRowsToTmdbItem, type DownloadedMetadataRow, searchCachedTmdb, type CachedPayloadRow, type CachedTmdbItem } from '../tmdb-cache-policy'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const CACHE_SCHEMA_VERSION = 1
const FRESH_TTL_MS = 24 * 60 * 60 * 1000
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 20_000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

const allowedPath = /^\/(?:trending\/(?:all|movie|tv)\/week|movie\/(?:popular|top_rated|\d+(?:\/videos|\/recommendations)?)|tv\/(?:popular|top_rated|\d+(?:\/videos|\/recommendations|\/season\/\d+)?)|discover\/(?:movie|tv)|search\/multi|configuration)$/
const paramsSchema = z.record(z.string().max(500)).default({}).refine((params) =>
  Object.keys(params).length <= 12 &&
  Object.keys(params).every((key) => ['page', 'sort_by', 'with_genres', 'primary_release_year', 'first_air_date_year', 'query', 'append_to_response'].includes(key)),
  'TMDB query parameter is not allowed',
)
const downloadSearchSchema = z.string().trim().min(2).max(200)
const requestSchema = z.object({
  path: z.string().max(256).regex(allowedPath),
  params: paramsSchema,
}).strict()

interface CacheRow {
  payload: string
  fetched_at: string
  expires_at: string
}

function cacheKey(path: string, params: Record<string, string>): string {
  const ordered = Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify([CACHE_SCHEMA_VERSION, path, ordered])
}

function readCache(key: string): CacheRow | undefined {
  return getDb().prepare(
    'SELECT payload, fetched_at, expires_at FROM tmdb_cache WHERE cache_key = ? AND schema_version = ?',
  ).get(key, CACHE_SCHEMA_VERSION) as CacheRow | undefined
}

function writeCache(key: string, path: string, params: Record<string, string>, payload: string): void {
  const now = new Date()
  const expires = new Date(now.getTime() + RETENTION_MS)
  getDb().prepare(`
    INSERT INTO tmdb_cache (cache_key, schema_version, request_path, request_params, payload, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      schema_version = excluded.schema_version,
      request_path = excluded.request_path,
      request_params = excluded.request_params,
      payload = excluded.payload,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key, CACHE_SCHEMA_VERSION, path, JSON.stringify(params), payload, now.toISOString(), expires.toISOString())
}

function purgeExpiredCache(): void {
  getDb().prepare('DELETE FROM tmdb_cache WHERE expires_at < ? OR schema_version != ?')
    .run(new Date().toISOString(), CACHE_SCHEMA_VERSION)
}

async function fetchTmdb(path: string, params: Record<string, string>, credential: string): Promise<string> {
  if (process.env['KOKOMOVIE_OFFLINE_TEST'] === '1') throw new Error('TMDB offline test mode')
  const url = new URL(`${TMDB_BASE}${path}`)
  const isV4 = credential.startsWith('eyJ') || credential.length > 40
  if (!isV4) url.searchParams.set('api_key', credential)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)

  const response = await net.fetch(url.toString(), {
    method: 'GET',
    headers: isV4 ? { Authorization: `Bearer ${credential}` } : {},
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`TMDB request failed with status ${response.status}`)
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('TMDB response is too large')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('TMDB response is too large')
  return new TextDecoder().decode(bytes)
}

function allCachedPayloads(): CachedPayloadRow[] {
  return getDb().prepare('SELECT request_path, payload FROM tmdb_cache WHERE schema_version = ?')
    .all(CACHE_SCHEMA_VERSION) as CachedPayloadRow[]
}

function downloadedTmdbItem(type: 'movie' | 'tv', tmdbId: number): CachedTmdbItem | null {
  const typePart = type === 'movie' ? '00000001' : '00000002'
  const contentId = `${typePart}-0000-4000-8000-${tmdbId.toString(16).padStart(12, '0')}`
  const rows = getDb().prepare("SELECT episode_id, title, thumbnail_url, duration_mins FROM downloads WHERE content_id = ? AND status = 'completed' ORDER BY downloaded_at DESC")
    .all(contentId) as DownloadedMetadataRow[]
  return downloadedRowsToTmdbItem(rows, type, tmdbId)
}

function localFallback(path: string, params: Record<string, string>): string | null {
  const rows = allCachedPayloads()
  if (path === '/search/multi') {
    const results = searchCachedTmdb(rows, params['query'] ?? '')
    return results.length > 0 ? JSON.stringify({ results, total_results: results.length, total_pages: 1 }) : null
  }
  const season = /^\/tv\/([0-9]+)\/season\/([0-9]+)$/.exec(path)
  if (season) {
    const downloaded = downloadedTmdbItem('tv', Number(season[1]))
    const seasons = downloaded?.['seasons']
    if (Array.isArray(seasons)) {
      const match = seasons.find((value) => value && typeof value === 'object' && (value as Record<string, unknown>)['season_number'] === Number(season[2]))
      if (match) return JSON.stringify(match)
    }
  }
  const detail = /^\/(movie|tv)\/([0-9]+)$/.exec(path)
  if (!detail) return null
  const item = findCachedTmdbItem(rows, detail[1] as 'movie' | 'tv', Number(detail[2])) ?? downloadedTmdbItem(detail[1] as 'movie' | 'tv', Number(detail[2]))
  if (!item) return null
  return JSON.stringify(detail[1] === 'movie'
    ? { ...item, runtime: item['runtime'] ?? null, genres: [], credits: { cast: [] }, external_ids: { imdb_id: null } }
    : { ...item, number_of_seasons: item['number_of_seasons'] ?? 0, number_of_episodes: item['number_of_episodes'] ?? 0, genres: [], seasons: item['seasons'] ?? [], credits: { cast: [] }, external_ids: { imdb_id: null } })
}

function mergeSearchBody(body: string, query: string): string {
  const page = JSON.parse(body) as { results?: CachedTmdbItem[]; total_results?: number; total_pages?: number }
  const merged = mergeTmdbItems(page.results ?? [], searchCachedTmdb(allCachedPayloads(), query))
  return JSON.stringify({ ...page, results: merged, total_results: Math.max(page.total_results ?? 0, merged.length) })
}

async function requestTmdb(path: string, params: Record<string, string>) {
  purgeExpiredCache()
  const key = cacheKey(path, params)
  const cached = readCache(key)
  const fallback = localFallback(path, params)
  const fetchedAt = cached ? Date.parse(cached.fetched_at) : 0
  const forcedOffline = process.env['KOKOMOVIE_OFFLINE_TEST'] === '1'
  if (cached && !forcedOffline && Date.now() - fetchedAt <= FRESH_TTL_MS) {
    void getTmdbCredential().then((credential) => {
      if (!credential) return
      return fetchTmdb(path, params, credential).then((body) => {
        const refreshed = path === '/search/multi' ? mergeSearchBody(body, params['query'] ?? '') : body
        JSON.parse(refreshed)
        writeCache(key, path, params, refreshed)
      })
    }).catch(() => {})
    return { body: cached.payload, source: 'cache' as const, stale: false, fetchedAt: cached.fetched_at }
  }

  const credential = await getTmdbCredential()
  if (!credential) {
    const body = cached?.payload ?? fallback
    if (body) return { body, source: 'cache' as const, stale: true, fetchedAt: cached?.fetched_at ?? null }
    throw new Error('TMDB_KEY_MISSING')
  }

  try {
    const networkBody = await fetchTmdb(path, params, credential)
    const body = path === '/search/multi' ? mergeSearchBody(networkBody, params['query'] ?? '') : networkBody
    JSON.parse(body)
    writeCache(key, path, params, body)
    return { body, source: 'network' as const, stale: false, fetchedAt: new Date().toISOString() }
  } catch (error) {
    const body = cached?.payload ?? fallback
    if (body) return { body, source: 'cache' as const, stale: true, fetchedAt: cached?.fetched_at ?? null }
    throw error
  }
}

export function registerTmdbRepositoryIpc(): void {
  ipcMain.handle('tmdb:request', async (event, input: unknown) => {
    assertTrustedRenderer(event)
    const request = requestSchema.parse(input)
    return requestTmdb(request.path, request.params)
  })

  ipcMain.handle('tmdb:search-downloads', (event, input: unknown) => {
    assertTrustedRenderer(event)
    const query = downloadSearchSchema.parse(input).toLocaleLowerCase()
    const rows = getDb().prepare("SELECT content_id, title, content_type, thumbnail_url, duration_mins FROM downloads WHERE status = 'completed' ORDER BY downloaded_at DESC")
      .all() as Array<{ content_id: string; title: string; content_type: string; thumbnail_url: string | null; duration_mins: number | null }>
    return [...new Map(rows
      .filter((row) => row.title.toLocaleLowerCase().includes(query))
      .map((row) => [row.content_id, {
        id: row.content_id, title: row.title, type: row.content_type === 'series' ? 'series' : 'movie',
        releaseYear: null, rating: null, imdbScore: null, durationMins: row.duration_mins,
        s3Thumbnail: row.thumbnail_url, backdropUrl: null, imdbId: null, tmdbId: null, planMinimum: 'basic',
      }])).values()]
  })

  ipcMain.handle('tmdb:validate-credential', async (event, input: unknown) => {
    assertTrustedRenderer(event)
    const credential = tmdbCredentialSchema.parse(input)
    try {
      await fetchTmdb('/configuration', {}, credential)
      await storeTmdbCredential(credential)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('tmdb:cache:stats', async (event) => {
    assertTrustedRenderer(event)
    const row = getDb().prepare('SELECT COUNT(*) AS entries, COALESCE(SUM(LENGTH(payload)), 0) AS bytes FROM tmdb_cache')
      .get() as { entries: number; bytes: number }
    const artwork = await getArtworkCacheStats()
    return { entries: row.entries + artwork.entries, bytes: row.bytes + artwork.bytes }
  })

  ipcMain.handle('tmdb:cache:clear', async (event) => {
    assertTrustedRenderer(event)
    const removed = getDb().prepare('DELETE FROM tmdb_cache').run().changes
    await clearArtworkCache()
    return { removed }
  })
}
