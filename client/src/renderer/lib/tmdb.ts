// Client-side TMDB access. KokoMovie runs fully local: the renderer talks to
// TMDB directly (via the main-process fetch proxy) using the user's own key from
// Settings — there is no backend catalog service. Ported from the former
// services/catalog/src/lib/tmdb.ts so content shapes stay identical.
import { normalizeLocale, tmdbLocale, type AppLocale } from '../../main/locales'

const BASE = 'https://api.themoviedb.org/3'
export const TMDB_IMG = 'https://image.tmdb.org/t/p'

// TMDB genre ID → our catalog slug
export const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy', 80: 'crime',
  99: 'documentary', 18: 'drama', 10751: 'kids', 14: 'fantasy', 27: 'horror',
  9648: 'mystery', 10749: 'romance', 878: 'sci-fi', 53: 'thriller', 37: 'western',
  10759: 'action', 10762: 'kids', 10765: 'sci-fi',
}

// slug → display name + a representative TMDB genre id for discover calls.
export const GENRES: Array<{ slug: string; name: string; movieId: number; tvId: number }> = [
  { slug: 'action', name: 'Action', movieId: 28, tvId: 10759 },
  { slug: 'comedy', name: 'Comedy', movieId: 35, tvId: 35 },
  { slug: 'drama', name: 'Drama', movieId: 18, tvId: 18 },
  { slug: 'sci-fi', name: 'Sci-Fi', movieId: 878, tvId: 10765 },
  { slug: 'horror', name: 'Horror', movieId: 27, tvId: 9648 },
  { slug: 'thriller', name: 'Thriller', movieId: 53, tvId: 80 },
  { slug: 'romance', name: 'Romance', movieId: 10749, tvId: 18 },
  { slug: 'animation', name: 'Animation', movieId: 16, tvId: 16 },
  { slug: 'documentary', name: 'Documentary', movieId: 99, tvId: 99 },
  { slug: 'fantasy', name: 'Fantasy', movieId: 14, tvId: 10765 },
  { slug: 'mystery', name: 'Mystery', movieId: 9648, tvId: 9648 },
  { slug: 'crime', name: 'Crime', movieId: 80, tvId: 80 },
]

export interface TmdbItem {
  id: number
  title?: string
  name?: string
  overview: string | null
  poster_path: string | null
  backdrop_path: string | null
  release_date?: string
  first_air_date?: string
  vote_average: number
  genre_ids?: number[]
  media_type?: 'movie' | 'tv' | 'person'
  runtime?: number | null
  number_of_seasons?: number
  original_language: string
}

export interface TmdbCredits {
  cast: Array<{ id: number; name: string; character: string; profile_path: string | null; order: number }>
}

export interface TmdbExternalIds {
  imdb_id: string | null
}

export interface TmdbMovieDetail extends TmdbItem {
  runtime: number | null
  genres: Array<{ id: number; name: string }>
  credits: TmdbCredits
  external_ids: TmdbExternalIds
}

export interface TmdbTvDetail extends TmdbItem {
  number_of_seasons: number
  number_of_episodes: number
  genres: Array<{ id: number; name: string }>
  seasons: Array<{
    id: number
    season_number: number
    name: string
    overview: string | null
    episode_count: number
    air_date: string | null
    poster_path: string | null
  }>
  credits: TmdbCredits
  external_ids: TmdbExternalIds
}

export interface TmdbSeason {
  id: number
  season_number: number
  name: string
  overview: string | null
  episodes: Array<{
    id: number
    episode_number: number
    name: string
    overview: string | null
    runtime: number | null
    still_path: string | null
    air_date: string | null
  }>
}

export interface TmdbPage {
  results: TmdbItem[]
  total_results: number
  total_pages: number
}

type TmdbResponseSource = 'network' | 'cache'
const tmdbResponseSources = new WeakMap<object, { source: TmdbResponseSource; stale: boolean }>()

function withTmdbSource<T>(value: T, source: TmdbResponseSource, stale: boolean): T {
  if (value && typeof value === 'object') tmdbResponseSources.set(value as object, { source, stale })
  return value
}

export function tmdbCatalogSource(...values: unknown[]): 'tmdb' | 'cache' {
  return values.some((value) => value && typeof value === 'object' && tmdbResponseSources.get(value as object)?.source === 'cache' && tmdbResponseSources.get(value as object)?.stale === true)
    ? 'cache'
    : 'tmdb'
}

function tmdbImageUrl(path: string | null, size: 'w185' | 'w300' | 'w500' | 'w1280'): string | null {
  if (!path) return null
  if (/^(?:https?:|offline:|catalog-cache:)/.test(path)) return path
  return typeof window !== 'undefined' && window.electronAPI
    ? `catalog-cache://image/${size}${path}`
    : `${TMDB_IMG}/${size}${path}`
}

export function posterUrl(path: string | null, size: 'w300' | 'w500' = 'w500'): string | null {
  return tmdbImageUrl(path, size)
}

export function backdropUrl(path: string | null): string | null {
  return tmdbImageUrl(path, 'w1280')
}

export function profileUrl(path: string | null): string | null {
  return tmdbImageUrl(path, 'w185')
}

export function stillUrl(path: string | null): string | null {
  return tmdbImageUrl(path, 'w300')
}

export function tmdbTitle(item: TmdbItem): string {
  return item.title ?? item.name ?? 'Unknown'
}

export function tmdbType(item: TmdbItem): 'movie' | 'series' {
  if (item.media_type) return item.media_type === 'tv' ? 'series' : 'movie'
  return item.name !== undefined ? 'series' : 'movie'
}

export function tmdbYear(item: TmdbItem): number | null {
  const d = item.release_date ?? item.first_air_date
  return d ? parseInt(d.slice(0, 4)) : null
}

// Deterministic UUID from TMDB type + id — lets us round-trip a content id back
// to a TMDB lookup with no database.
export function tmdbContentId(type: 'movie' | 'tv', tmdbId: number): string {
  const typeChar = type === 'movie' ? '1' : '2'
  const typePart = `0000000${typeChar}`
  const idPart = tmdbId.toString(16).padStart(12, '0')
  return `${typePart}-0000-4000-8000-${idPart}`
}

export function decodeTmdbContentId(uuidStr: string): { type: 'movie' | 'tv'; tmdbId: number } | null {
  const match = uuidStr.match(/^0000000([12])-0000-4000-8000-([0-9a-f]{12})$/i)
  if (!match) return null
  const type = match[1] === '1' ? 'movie' : 'tv'
  const tmdbId = parseInt(match[2]!, 16)
  return { type, tmdbId }
}

// Deterministic episode id from TMDB tv + season + episode numbers.
export function tmdbEpisodeId(tvId: number, season: number, episode: number): string {
  return `ep-${tvId}-${season}-${episode}`
}

// Inverse of tmdbEpisodeId. Returns null for movie rows (empty episode id).
export function decodeTmdbEpisodeId(id: string | null | undefined): { tvId: number; season: number; episode: number } | null {
  const m = /^ep-(\d+)-(\d+)-(\d+)$/.exec(id ?? '')
  if (!m) return null
  return { tvId: Number(m[1]), season: Number(m[2]), episode: Number(m[3]) }
}

// Sortable rank for "most advanced episode" comparisons (season-major so S2E1 > S1E9).
// Movies (no episode id) rank 0, which is fine since each movie has a single row.
export function episodeRank(id: string | null | undefined): number {
  const d = decodeTmdbEpisodeId(id)
  return d ? d.season * 10000 + d.episode : 0
}

// TMDB accepts two credential styles: a v3 API key (query param) or a v4 read
// token (Bearer JWT). Support both — the Settings UI tells users either is fine.
export function isV4Token(key: string): boolean {
  return key.startsWith('eyJ') || key.length > 40
}

async function tmdbFetch<T>(path: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  // Installed Electron builds keep credential-bearing requests and caching in main.
  if (window.electronAPI?.tmdbRequest) {
    const response = await window.electronAPI.tmdbRequest(path, params)
    return withTmdbSource(JSON.parse(response.body) as T, response.source, response.stale)
  }

  // Browser-only development fallback: no local main process or durable cache.
  const url = new URL(`${BASE}${path}`)
  const v4 = isV4Token(apiKey)
  if (!v4) url.searchParams.set('api_key', apiKey)
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value))
  const headers: Record<string, string> = v4 ? { Authorization: `Bearer ${apiKey}` } : {}
  const response = await fetch(url.toString(), { headers })
  if (!response.ok) throw new Error(`TMDB ${path} -> ${response.status}`)
  return withTmdbSource(await response.json() as T, 'network', false)
}

export function createTmdbClient(apiKey: string, locale: AppLocale | string = 'en-US') {
  const language = tmdbLocale(normalizeLocale(locale))
  const get = <T>(path: string, params?: Record<string, string>) =>
    tmdbFetch<T>(path, apiKey, { ...params, language })

  return {
    trending: (type: 'all' | 'movie' | 'tv' = 'all', page = 1) =>
      get<TmdbPage>(`/trending/${type}/week`, { page: String(page) }),
    popularMovies: (page = 1) => get<TmdbPage>('/movie/popular', { page: String(page) }),
    popularTv: (page = 1) => get<TmdbPage>('/tv/popular', { page: String(page) }),
    topRatedMovies: () => get<TmdbPage>('/movie/top_rated'),
    topRatedTv: () => get<TmdbPage>('/tv/top_rated'),
    discoverMovie: (genreId?: number, page = 1, year?: number) =>
      get<TmdbPage>('/discover/movie', {
        page: String(page),
        sort_by: 'popularity.desc',
        ...(genreId ? { with_genres: String(genreId) } : {}),
        ...(year ? { primary_release_year: String(year) } : {}),
      }),
    discoverTv: (genreId?: number, page = 1, year?: number) =>
      get<TmdbPage>('/discover/tv', {
        page: String(page),
        sort_by: 'popularity.desc',
        ...(genreId ? { with_genres: String(genreId) } : {}),
        ...(year ? { first_air_date_year: String(year) } : {}),
      }),
    searchMulti: (query: string, page = 1) =>
      get<TmdbPage>('/search/multi', { query, page: String(page) }),
    getMovie: (id: number) =>
      get<TmdbMovieDetail>(`/movie/${id}`, { append_to_response: 'credits,external_ids' }),
    getTv: (id: number) =>
      get<TmdbTvDetail>(`/tv/${id}`, { append_to_response: 'credits,external_ids' }),
    getSeason: (tvId: number, season: number) => get<TmdbSeason>(`/tv/${tvId}/season/${season}`),
    getMovieVideos: (id: number) =>
      get<{ results: Array<{ key: string; site: string; type: string; official: boolean }> }>(`/movie/${id}/videos`),
    getTvVideos: (id: number) =>
      get<{ results: Array<{ key: string; site: string; type: string; official: boolean }> }>(`/tv/${id}/videos`),
    getSimilarMovies: (id: number) => get<TmdbPage>(`/movie/${id}/recommendations`),
    getSimilarTv: (id: number) => get<TmdbPage>(`/tv/${id}/recommendations`),
  }
}

export type TmdbClient = ReturnType<typeof createTmdbClient>
