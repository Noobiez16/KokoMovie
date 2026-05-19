const BASE = 'https://api.themoviedb.org/3'
export const TMDB_IMG = 'https://image.tmdb.org/t/p'

// TMDB genre ID → our catalog slug
export const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy', 80: 'crime',
  99: 'documentary', 18: 'drama', 10751: 'kids', 14: 'fantasy', 27: 'horror',
  9648: 'mystery', 10749: 'romance', 878: 'sci-fi', 53: 'thriller', 37: 'western',
  10759: 'action', 10762: 'kids', 10765: 'sci-fi',
}

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

export function posterUrl(path: string | null, size: 'w300' | 'w500' = 'w500'): string | null {
  return path ? `${TMDB_IMG}/${size}${path}` : null
}

export function backdropUrl(path: string | null): string | null {
  return path ? `${TMDB_IMG}/w1280${path}` : null
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

// Deterministic UUID from TMDB type + id
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

async function tmdbFetch<T>(path: string, apiKey: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('api_key', apiKey)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`TMDB ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export function createTmdbClient(apiKey: string) {
  const get = <T>(path: string, params?: Record<string, string>) =>
    tmdbFetch<T>(path, apiKey, params)

  return {
    trending: (type: 'all' | 'movie' | 'tv' = 'all') =>
      get<TmdbPage>(`/trending/${type}/week`),

    popularMovies: (page = 1) =>
      get<TmdbPage>('/movie/popular', { page: String(page) }),

    popularTv: (page = 1) =>
      get<TmdbPage>('/tv/popular', { page: String(page) }),

    topRatedMovies: () =>
      get<TmdbPage>('/movie/top_rated'),

    topRatedTv: () =>
      get<TmdbPage>('/tv/top_rated'),

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

    getSeason: (tvId: number, season: number) =>
      get<TmdbSeason>(`/tv/${tvId}/season/${season}`),

    getMovieVideos: (id: number) =>
      get<{ results: Array<{ key: string; site: string; type: string; official: boolean }> }>(`/movie/${id}/videos`),

    getTvVideos: (id: number) =>
      get<{ results: Array<{ key: string; site: string; type: string; official: boolean }> }>(`/tv/${id}/videos`),

    getSimilarMovies: (id: number) =>
      get<TmdbPage>(`/movie/${id}/recommendations`),

    getSimilarTv: (id: number) =>
      get<TmdbPage>(`/tv/${id}/recommendations`),
  }
}
