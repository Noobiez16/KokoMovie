export interface CachedPayloadRow {
  request_path: string
  payload: string
}

export function tmdbRequestCacheKey(path: string, params: Record<string, string>, schemaVersion = 1): string {
  const ordered = Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify([schemaVersion, path, ordered])
}

export interface CachedTmdbItem {
  id: number
  title?: string
  name?: string
  overview?: string | null
  poster_path?: string | null
  backdrop_path?: string | null
  media_type?: 'movie' | 'tv'
  [key: string]: unknown
}

function inferredType(path: string): 'movie' | 'tv' | undefined {
  if (path.includes('/movie')) return 'movie'
  if (path.includes('/tv')) return 'tv'
  return undefined
}

export function cachedTmdbItems(rows: CachedPayloadRow[]): CachedTmdbItem[] {
  const collected: CachedTmdbItem[] = []
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as Record<string, unknown>
      const candidates = Array.isArray(payload['results']) ? payload['results'] : [payload]
      for (const value of candidates) {
        if (!value || typeof value !== 'object') continue
        const item = value as CachedTmdbItem
        if (!Number.isInteger(item.id) || (!item.title && !item.name)) continue
        const type = item.media_type ?? inferredType(row.request_path)
        if (!type) continue
        collected.push({ ...item, media_type: type })
      }
    } catch {
      // A corrupt cache row is ignored and replaced on the next successful fetch.
    }
  }
  return [...new Map(collected.map((item) => [`${item.media_type}:${item.id}`, item])).values()]
}

export function searchCachedTmdb(rows: CachedPayloadRow[], query: string): CachedTmdbItem[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  return cachedTmdbItems(rows).filter((item) => {
    const text = `${item.title ?? ''} ${item.name ?? ''} ${item.overview ?? ''}`.toLocaleLowerCase()
    return terms.every((term) => text.includes(term))
  })
}

export function findCachedTmdbItem(
  rows: CachedPayloadRow[],
  type: 'movie' | 'tv',
  id: number,
): CachedTmdbItem | null {
  return cachedTmdbItems(rows).find((item) => item.media_type === type && item.id === id) ?? null
}

export function mergeTmdbItems(primary: CachedTmdbItem[], cached: CachedTmdbItem[]): CachedTmdbItem[] {
  const primaryKeys = new Set(primary.map((item) => `${item.media_type}:${item.id}`))
  return [...primary, ...cached.filter((item) => !primaryKeys.has(`${item.media_type}:${item.id}`))]
}

export interface DownloadedMetadataRow {
  episode_id: string | null
  title: string
  thumbnail_url: string | null
  duration_mins: number | null
}

export function downloadedRowsToTmdbItem(
  rows: DownloadedMetadataRow[],
  type: 'movie' | 'tv',
  tmdbId: number,
): CachedTmdbItem | null {
  const first = rows[0]
  if (!first) return null
  if (type === 'movie') return {
    id: tmdbId, title: first.title, media_type: 'movie', overview: null, poster_path: first.thumbnail_url,
    backdrop_path: null, release_date: '', vote_average: 0, original_language: 'en', runtime: first.duration_mins,
  }

  const bySeason = new Map<number, Array<Record<string, unknown>>>()
  for (const row of rows) {
    const episode = /^ep-[0-9]+-([0-9]+)-([0-9]+)$/.exec(row.episode_id ?? '')
    if (!episode) continue
    const seasonNumber = Number(episode[1])
    const episodeNumber = Number(episode[2])
    const list = bySeason.get(seasonNumber) ?? []
    list.push({ id: episodeNumber, episode_number: episodeNumber, name: row.title.split(' - ').pop() ?? row.title, overview: null, runtime: row.duration_mins, still_path: row.thumbnail_url, air_date: null })
    bySeason.set(seasonNumber, list)
  }
  const seasons = [...bySeason.entries()].sort(([a], [b]) => a - b).map(([seasonNumber, episodes]) => ({
    id: seasonNumber, season_number: seasonNumber, name: `Season ${seasonNumber}`, overview: null,
    episode_count: episodes.length, air_date: null, poster_path: first.thumbnail_url, episodes,
  }))
  return {
    id: tmdbId, name: first.title.split(' - S')[0] ?? first.title, media_type: 'tv', overview: null,
    poster_path: first.thumbnail_url, backdrop_path: null, first_air_date: '', vote_average: 0,
    original_language: 'en', number_of_seasons: seasons.length, number_of_episodes: rows.length, seasons,
  }
}
