// Local catalog: talks to TMDB directly using the user's key from Settings.
// Same exported shapes as before, so pages/components are unchanged.
import { useSettingsStore } from '../store/settings'
import {
  createTmdbClient, GENRES, TMDB_GENRE_MAP,
  posterUrl, backdropUrl, profileUrl, stillUrl,
  tmdbTitle, tmdbType, tmdbYear, tmdbContentId, decodeTmdbContentId, tmdbEpisodeId,
  type TmdbItem, type TmdbClient,
} from '../lib/tmdb'

export interface ContentSummary {
  id: string
  title: string
  type: 'movie' | 'series'
  releaseYear: number | null
  rating: string | null
  imdbScore: string | null
  durationMins: number | null
  s3Thumbnail: string | null
  backdropUrl: string | null
  imdbId: string | null
  tmdbId: number | null
  planMinimum: string
  trailerKey?: string
}

export interface Genre {
  id: string
  name: string
  slug: string
}

export interface CastMember {
  id: string
  name: string
  photoUrl: string | null
  role: string | null
  order: number
}

export interface Episode {
  id: string
  seasonId: string
  contentId: string
  episodeNumber: number
  title: string
  description: string | null
  durationMins: number | null
  s3HlsKey: string | null
  s3ThumbnailKey: string | null
  introStartSecs: number | null
  introEndSecs: number | null
  creditsStartSecs: number | null
  airDate: string | null
}

export interface Season {
  id: string
  contentId: string
  seasonNumber: number
  title: string | null
  overview: string | null
  episodes: Episode[]
}

export interface ContentDetail extends ContentSummary {
  description: string | null
  s3HlsKey: string | null
  s3TrailerKey: string | null
  drmKeyId: string | null
  introStartSecs: number | null
  introEndSecs: number | null
  creditsStartSecs: number | null
  genres: Genre[]
  cast: CastMember[]
  seasons: Season[]
}

export interface HomeRow {
  genre: Genre
  items: ContentSummary[]
}

export interface HomeData {
  featured: ContentSummary | null
  trending: ContentSummary[]
  rows: HomeRow[]
}

export type CatalogSource = 'tmdb' | 'local'

export interface PaginatedMeta {
  requestId: string
  timestamp: string
  source?: CatalogSource
  pagination: { page: number; limit: number; total: number; pages: number }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export class TmdbKeyMissingError extends Error {
  constructor() {
    super('TMDB_KEY_MISSING')
    this.name = 'TmdbKeyMissingError'
  }
}

function client(): TmdbClient {
  const key = useSettingsStore.getState().tmdbApiKey?.trim()
  if (!key) throw new TmdbKeyMissingError()
  return createTmdbClient(key)
}

function meta() {
  return { requestId: crypto.randomUUID(), timestamp: new Date().toISOString() }
}

function toSummary(item: TmdbItem): ContentSummary {
  const type = tmdbType(item)
  return {
    id: tmdbContentId(type === 'series' ? 'tv' : 'movie', item.id),
    title: tmdbTitle(item),
    type,
    releaseYear: tmdbYear(item),
    rating: null,
    imdbScore: item.vote_average > 0 ? item.vote_average.toFixed(1) : null,
    durationMins: item.runtime ?? null,
    s3Thumbnail: posterUrl(item.poster_path),
    backdropUrl: backdropUrl(item.backdrop_path),
    imdbId: null,
    tmdbId: item.id,
    planMinimum: 'basic',
  }
}

// Drop people from multi-search and items with no poster.
export function tmdbItemsToSummaries(items: TmdbItem[]): ContentSummary[] {
  return summaries(items)
}
function summaries(items: TmdbItem[]): ContentSummary[] {
  const mapped = items
    .filter((i) => i.media_type !== 'person')
    .filter((i) => i.poster_path)
    .map(toSummary)
  // De-duplicate by content id. TMDB occasionally returns the same title twice in a
  // single result set, which otherwise renders a duplicate card (and trips React's
  // "two children with the same key" warning).
  return [...new Map(mapped.map((s) => [s.id, s])).values()]
}

function pickTrailer(videos: Array<{ key: string; site: string; type: string; official: boolean }>): string | undefined {
  const yt = videos.filter((v) => v.site === 'YouTube')
  const pick = yt.find((v) => v.type === 'Trailer' && v.official) ?? yt.find((v) => v.type === 'Trailer') ?? yt[0]
  return pick?.key
}

function mapGenres(genres: Array<{ id: number; name: string }>): Genre[] {
  return genres.map((g) => {
    const slug = TMDB_GENRE_MAP[g.id] ?? String(g.id)
    return { id: slug, name: g.name, slug }
  })
}

function mapCast(cast: Array<{ id: number; name: string; character: string; profile_path: string | null; order: number }>): CastMember[] {
  return cast.slice(0, 20).map((p) => ({
    id: String(p.id),
    name: p.name,
    photoUrl: profileUrl(p.profile_path),
    role: p.character || null,
    order: p.order,
  }))
}

// ── API ──────────────────────────────────────────────────────────────────────

export const catalogApi = {
  getHome: async (params: { type?: string } = {}, _profileId?: string) => {
    const c = client()
    const type = params.type
    const trendingType = type === 'movie' ? 'movie' : type === 'series' ? 'tv' : 'all'
    const trendingPage = await c.trending(trendingType, 1)
    const trending = summaries(trendingPage.results).slice(0, 20)

    const rowGenres = GENRES.slice(0, 8)
    const rowPages = await Promise.all(
      rowGenres.map((g) => (type === 'series' ? c.discoverTv(g.tvId) : c.discoverMovie(g.movieId))),
    )
    const rows: HomeRow[] = rowGenres
      .map((g, i) => ({
        genre: { id: g.slug, name: g.name, slug: g.slug },
        items: summaries(rowPages[i]!.results).slice(0, 20),
      }))
      .filter((r) => r.items.length > 0)

    const featured = trending[0] ?? null
    return { success: true as const, data: { featured, trending, rows } as HomeData, meta: { ...meta(), source: 'tmdb' as CatalogSource } }
  },

  browse: async (
    params: { genre?: string; type?: string; year?: number; page?: number; limit?: number },
    _profileId?: string,
  ) => {
    const c = client()
    const page = params.page ?? 1
    const g = params.genre ? GENRES.find((x) => x.slug === params.genre) : undefined
    const isTv = params.type === 'series'
    const res = isTv ? await c.discoverTv(g?.tvId, page, params.year) : await c.discoverMovie(g?.movieId, page, params.year)
    return {
      success: true as const,
      data: summaries(res.results),
      meta: {
        ...meta(),
        source: 'tmdb' as CatalogSource,
        pagination: { page, limit: 20, total: res.total_results, pages: Math.min(res.total_pages, 500) },
      } as PaginatedMeta,
    }
  },

  getContent: async (id: string, _profileId?: string) => {
    const c = client()
    const decoded = decodeTmdbContentId(id)
    if (!decoded) throw new Error(`Unrecognised content id: ${id}`)

    if (decoded.type === 'movie') {
      const [m, videos] = await Promise.all([
        c.getMovie(decoded.tmdbId),
        c.getMovieVideos(decoded.tmdbId).catch(() => ({ results: [] })),
      ])
      const detail: ContentDetail = {
        ...toSummary({ ...m, media_type: 'movie' }),
        durationMins: m.runtime ?? null,
        imdbId: m.external_ids?.imdb_id ?? null,
        description: m.overview ?? null,
        s3HlsKey: null, s3TrailerKey: null, drmKeyId: null,
        introStartSecs: null, introEndSecs: null, creditsStartSecs: null,
        trailerKey: pickTrailer(videos.results),
        genres: mapGenres(m.genres ?? []),
        cast: mapCast(m.credits?.cast ?? []),
        seasons: [],
      }
      return { success: true as const, data: detail, meta: meta() }
    }

    // TV
    const [tv, videos] = await Promise.all([
      c.getTv(decoded.tmdbId),
      c.getTvVideos(decoded.tmdbId).catch(() => ({ results: [] })),
    ])
    const realSeasons = (tv.seasons ?? []).filter((s) => s.season_number >= 1)
    const seasonDetails = await Promise.all(
      realSeasons.map((s) => c.getSeason(decoded.tmdbId, s.season_number).catch(() => null)),
    )
    const seasons: Season[] = seasonDetails
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => ({
        id: `s-${decoded.tmdbId}-${s.season_number}`,
        contentId: id,
        seasonNumber: s.season_number,
        title: s.name ?? null,
        overview: s.overview ?? null,
        episodes: (s.episodes ?? []).map((e) => ({
          id: tmdbEpisodeId(decoded.tmdbId, s.season_number, e.episode_number),
          seasonId: `s-${decoded.tmdbId}-${s.season_number}`,
          contentId: id,
          episodeNumber: e.episode_number,
          title: e.name ?? `Episode ${e.episode_number}`,
          description: e.overview ?? null,
          durationMins: e.runtime ?? null,
          s3HlsKey: null,
          s3ThumbnailKey: stillUrl(e.still_path),
          introStartSecs: null, introEndSecs: null, creditsStartSecs: null,
          airDate: e.air_date ?? null,
        })),
      }))

    const detail: ContentDetail = {
      ...toSummary({ ...tv, media_type: 'tv' }),
      imdbId: tv.external_ids?.imdb_id ?? null,
      description: tv.overview ?? null,
      s3HlsKey: null, s3TrailerKey: null, drmKeyId: null,
      introStartSecs: null, introEndSecs: null, creditsStartSecs: null,
      trailerKey: pickTrailer(videos.results),
      genres: mapGenres(tv.genres ?? []),
      cast: mapCast(tv.credits?.cast ?? []),
      seasons,
    }
    return { success: true as const, data: detail, meta: meta() }
  },

  search: async (q: string, params: { type?: string; genres?: string; page?: number } = {}, _profileId?: string) => {
    const c = client()
    const page = params.page ?? 1
    const res = await c.searchMulti(q, page)
    let data = summaries(res.results)
    if (params.type === 'movie') data = data.filter((d) => d.type === 'movie')
    if (params.type === 'series') data = data.filter((d) => d.type === 'series')
    return { success: true as const, data, meta: { ...meta(), query: q, total: res.total_results } }
  },

  // No AI backend in the local build — behave like a normal search.
  semanticSearch: async (q: string, params: { type?: string; page?: number } = {}, _profileId?: string) => {
    const res = await catalogApi.search(q, params)
    return { success: true as const, data: res.data, meta: { query: q, expandedTerms: [] as string[], total: res.data.length } }
  },

  getTrending: async (_profileId?: string) => {
    const c = client()
    const res = await c.trending('all', 1)
    return { success: true as const, data: summaries(res.results).slice(0, 20) }
  },

  getGenres: async (_profileId?: string) => {
    return { success: true as const, data: GENRES.map((g) => ({ id: g.slug, name: g.name, slug: g.slug })) as Genre[] }
  },

  // Content ids are deterministic from TMDB, so "sync" is just a local mapping.
  syncContent: async (tmdbId: number, type: 'movie' | 'tv') => {
    return { success: true as const, data: { id: tmdbContentId(type, tmdbId) } }
  },

  // Lightweight enrichment for watchlist / continue-watching rows. Returns null
  // (rather than throwing) when the id is unknown or no TMDB key is set, so
  // callers can simply drop the entry.
  getSummary: async (id: string): Promise<ContentSummary | null> => {
    const decoded = decodeTmdbContentId(id)
    if (!decoded) return null
    try {
      const c = client()
      const item = decoded.type === 'movie' ? await c.getMovie(decoded.tmdbId) : await c.getTv(decoded.tmdbId)
      const summary = toSummary({ ...item, media_type: decoded.type })
      return { ...summary, durationMins: ('runtime' in item ? item.runtime : null) ?? summary.durationMins }
    } catch {
      return null
    }
  },
}
