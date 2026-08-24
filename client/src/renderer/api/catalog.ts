// Local catalog: talks to TMDB directly using the user's key from Settings.
// Same exported shapes as before, so pages/components are unchanged.
import { useSettingsStore } from '../store/settings'
import i18n from '../i18n'
import {
  createTmdbClient, GENRES, TMDB_GENRE_MAP,
  posterUrl, backdropUrl, profileUrl, stillUrl,
  tmdbTitle, tmdbType, tmdbYear, tmdbContentId, decodeTmdbContentId, tmdbEpisodeId,
  type TmdbItem, type TmdbClient, tmdbCatalogSource,
} from '../lib/tmdb'
import {
  certificationRegionForLocale,
  filterByMaturity,
  isCertificationAllowed,
  selectMovieCertification,
  selectTvCertification,
  type CertificationRegion,
} from '../lib/certification-policy'

// TMDB refuses discover queries beyond page 500.
const TMDB_MAX_PAGE = 500
// Upper bound on TMDB requests combined into a single category view. Category pages request 80
// items (4 pages); the cap keeps one page change from fanning out into an unbounded burst.
const TMDB_PAGES_PER_VIEW_MAX = 5

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

export type CatalogSource = 'tmdb' | 'cache' | 'local'

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
  return createTmdbClient(key, i18n.language)
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

export class ContentRestrictedByMaturityError extends Error {
  constructor() {
    super('CONTENT_RESTRICTED_BY_MATURITY')
    this.name = 'ContentRestrictedByMaturityError'
  }
}

function mapSeason(contentId: string, tvId: number, season: Awaited<ReturnType<TmdbClient['getSeason']>>): Season {
  return {
    id: `s-${tvId}-${season.season_number}`,
    contentId,
    seasonNumber: season.season_number,
    title: season.name ?? null,
    overview: season.overview ?? null,
    episodes: (season.episodes ?? []).map((episode) => ({
      id: tmdbEpisodeId(tvId, season.season_number, episode.episode_number),
      seasonId: `s-${tvId}-${season.season_number}`,
      contentId,
      episodeNumber: episode.episode_number,
      title: episode.name ?? `Episode ${episode.episode_number}`,
      description: episode.overview ?? null,
      durationMins: episode.runtime ?? null,
      s3HlsKey: null,
      s3ThumbnailKey: stillUrl(episode.still_path),
      introStartSecs: null,
      introEndSecs: null,
      creditsStartSecs: null,
      airDate: episode.air_date ?? null,
    })),
  }
}

async function savedMaturityMaximum(): Promise<string> {
  try {
    return (await window.electronAPI?.prefsGet())?.maturity_rating ?? 'TV-MA'
  } catch {
    return 'TV-MA'
  }
}

async function loadSummaryCertification(
  c: TmdbClient,
  summary: ContentSummary,
  region: CertificationRegion,
): Promise<string | null> {
  if (!summary.tmdbId) return null
  try {
    return summary.type === 'movie'
      ? selectMovieCertification(await c.getMovieReleaseDates(summary.tmdbId), region)
      : selectTvCertification(await c.getTvContentRatings(summary.tmdbId), region)
  } catch {
    return null
  }
}

export async function applyCatalogMaturity(items: ContentSummary[], c: TmdbClient): Promise<ContentSummary[]> {
  const maximum = await savedMaturityMaximum()
  const region = certificationRegionForLocale(i18n.language)
  return filterByMaturity(items, maximum, region, (item) => loadSummaryCertification(c, item, region))
}

// ── API ──────────────────────────────────────────────────────────────────────

export const catalogApi = {
  getHome: async (params: { type?: string } = {}, _profileId?: string) => {
    const c = client()
    const type = params.type
    const trendingType = type === 'movie' ? 'movie' : type === 'series' ? 'tv' : 'all'
    const trendingPage = await c.trending(trendingType, 1)
    const trending = await applyCatalogMaturity(summaries(trendingPage.results).slice(0, 20), c)

    const rowGenres = GENRES.slice(0, 8)
    const rowPages = await Promise.all(
      rowGenres.map((g) => (type === 'series' ? c.discoverTv(g.tvId) : c.discoverMovie(g.movieId))),
    )
    const rows: HomeRow[] = (await Promise.all(rowGenres
      .map(async (g, i) => ({
        genre: { id: g.slug, name: g.name, slug: g.slug },
        items: await applyCatalogMaturity(summaries(rowPages[i]!.results).slice(0, 20), c),
      }))))
      .filter((r) => r.items.length > 0)

    const featured = trending[0] ?? null
    return { success: true as const, data: { featured, trending, rows } as HomeData, meta: { ...meta(), source: tmdbCatalogSource(trendingPage, ...rowPages) as CatalogSource } }
  },

  browse: async (
    params: { genre?: string; type?: string; year?: number; page?: number; limit?: number },
    _profileId?: string,
  ) => {
    const c = client()
    const page = params.page ?? 1
    const g = params.genre ? GENRES.find((x) => x.slug === params.genre) : undefined
    const isTv = params.type === 'series'

    // TMDB discover pages are fixed at 20 results, so a larger page size means fetching several
    // consecutive TMDB pages and presenting them as one. `limit` used to be accepted and silently
    // ignored, which is why category views always showed 20 items no matter what was requested.
    const perTmdbPage = 20
    const batch = Math.min(Math.max(Math.ceil((params.limit ?? perTmdbPage) / perTmdbPage), 1), TMDB_PAGES_PER_VIEW_MAX)
    const firstTmdbPage = (page - 1) * batch + 1

    const responses = (
      await Promise.all(
        Array.from({ length: batch }, (_, offset) => {
          const tmdbPage = firstTmdbPage + offset
          if (tmdbPage > TMDB_MAX_PAGE) return null
          const request = isTv
            ? c.discoverTv(g?.tvId, tmdbPage, params.year)
            : c.discoverMovie(g?.movieId, tmdbPage, params.year)
          // A later page in the batch can legitimately fall past the end of the result set; that
          // must shorten the view, not fail the whole request.
          return offset === 0 ? request : request.catch(() => null)
        }),
      )
    ).filter((res): res is NonNullable<typeof res> => res !== null)

    const [first] = responses
    if (!first) throw new Error('Could not load this category.')

    // Consecutive discover pages can repeat a title as popularity shifts between requests.
    const combined = [...new Map(responses.flatMap((res) => res.results).map((item) => [item.id, item])).values()]
    const totalTmdbPages = Math.min(first.total_pages, TMDB_MAX_PAGE)

    return {
      success: true as const,
      data: await applyCatalogMaturity(summaries(combined), c),
      meta: {
        ...meta(),
        source: tmdbCatalogSource(...responses) as CatalogSource,
        pagination: {
          page,
          limit: batch * perTmdbPage,
          total: first.total_results,
          pages: Math.max(Math.ceil(totalTmdbPages / batch), 1),
        },
      } as PaginatedMeta,
    }
  },

  getContent: async (id: string, _profileId?: string) => {
    const c = client()
    const decoded = decodeTmdbContentId(id)
    if (!decoded) throw new Error(`Unrecognised content id: ${id}`)

    if (decoded.type === 'movie') {
      const region = certificationRegionForLocale(i18n.language)
      const [m, maximum] = await Promise.all([
        c.getMovie(decoded.tmdbId),
        savedMaturityMaximum(),
      ])
      const certification = selectMovieCertification(m.release_dates ?? { results: [] }, region)
      if (!isCertificationAllowed(certification, maximum, region)) throw new Error('CONTENT_RESTRICTED_BY_MATURITY')
      const detail: ContentDetail = {
        ...toSummary({ ...m, media_type: 'movie' }),
        rating: certification,
        durationMins: m.runtime ?? null,
        imdbId: m.external_ids?.imdb_id ?? null,
        description: m.overview ?? null,
        s3HlsKey: null, s3TrailerKey: null, drmKeyId: null,
        introStartSecs: null, introEndSecs: null, creditsStartSecs: null,
        trailerKey: pickTrailer(m.videos?.results ?? []),
        genres: mapGenres(m.genres ?? []),
        cast: mapCast(m.credits?.cast ?? []),
        seasons: [],
      }
      return { success: true as const, data: detail, meta: { ...meta(), source: tmdbCatalogSource(m) as CatalogSource } }
    }

    // TV
    const region = certificationRegionForLocale(i18n.language)
    const [tv, maximum] = await Promise.all([
      c.getTv(decoded.tmdbId),
      savedMaturityMaximum(),
    ])
    const certification = selectTvCertification(tv.content_ratings ?? { results: [] }, region)
    if (!isCertificationAllowed(certification, maximum, region)) throw new Error('CONTENT_RESTRICTED_BY_MATURITY')
    const realSeasons = (tv.seasons ?? []).filter((s) => s.season_number >= 1)
    const defaultSeasonNumber = realSeasons[0]?.season_number
    const defaultSeason = defaultSeasonNumber === undefined
      ? null
      : await c.getSeason(decoded.tmdbId, defaultSeasonNumber).catch(() => null)
    const seasons: Season[] = realSeasons.map((season) => {
      if (defaultSeason?.season_number === season.season_number) return mapSeason(id, decoded.tmdbId, defaultSeason)
      return {
        id: `s-${decoded.tmdbId}-${season.season_number}`,
        contentId: id,
        seasonNumber: season.season_number,
        title: season.name ?? null,
        overview: season.overview ?? null,
        episodes: [],
      }
    })

    const detail: ContentDetail = {
      ...toSummary({ ...tv, media_type: 'tv' }),
      rating: certification,
      imdbId: tv.external_ids?.imdb_id ?? null,
      description: tv.overview ?? null,
      s3HlsKey: null, s3TrailerKey: null, drmKeyId: null,
      introStartSecs: null, introEndSecs: null, creditsStartSecs: null,
      trailerKey: pickTrailer(tv.videos?.results ?? []),
      genres: mapGenres(tv.genres ?? []),
      cast: mapCast(tv.credits?.cast ?? []),
      seasons,
    }
    return { success: true as const, data: detail, meta: { ...meta(), source: tmdbCatalogSource(tv, defaultSeason) as CatalogSource } }
  },

  getSeason: async (contentId: string, seasonNumber: number) => {
    const decoded = decodeTmdbContentId(contentId)
    if (!decoded || decoded.type !== 'tv') throw new Error(`Unrecognised series id: ${contentId}`)
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) throw new Error('Invalid season number')
    const season = await client().getSeason(decoded.tmdbId, seasonNumber)
    return { success: true as const, data: mapSeason(contentId, decoded.tmdbId, season), meta: meta() }
  },

  search: async (q: string, params: { type?: string; genres?: string; page?: number } = {}, _profileId?: string) => {
    const page = params.page ?? 1
    const c = client()
    const downloaded = window.electronAPI ? await window.electronAPI.searchDownloadedCatalog(q) : []
    let online: ContentSummary[] = []
    let onlineTotal = 0
    let searchSource: CatalogSource = downloaded.length > 0 ? 'cache' : 'tmdb'
    try {
      const res = await c.searchMulti(q, page)
      online = summaries(res.results)
      onlineTotal = res.total_results
      searchSource = tmdbCatalogSource(res) as CatalogSource
    } catch (error) {
      if (downloaded.length === 0) throw error
    }
    let data = [...new Map([...online, ...downloaded].map((item) => [item.id, item])).values()]
    if (params.type === 'movie') data = data.filter((item) => item.type === 'movie')
    if (params.type === 'series') data = data.filter((item) => item.type === 'series')
    data = await applyCatalogMaturity(data, c)
    return { success: true as const, data, meta: { ...meta(), query: q, total: Math.max(onlineTotal, data.length), source: searchSource } }
  },

  // No AI backend in the local build — behave like a normal search.
  semanticSearch: async (q: string, params: { type?: string; page?: number } = {}, _profileId?: string) => {
    const res = await catalogApi.search(q, params)
    return { success: true as const, data: res.data, meta: { query: q, expandedTerms: [] as string[], total: res.data.length } }
  },

  getTrending: async (_profileId?: string) => {
    const c = client()
    const res = await c.trending('all', 1)
    return { success: true as const, data: await applyCatalogMaturity(summaries(res.results).slice(0, 20), c) }
  },

  getGenres: async (_profileId?: string) => {
    return { success: true as const, data: GENRES.map((g) => ({ id: g.slug, name: g.name, slug: g.slug })) as Genre[] }
  },

  // Content ids are deterministic from TMDB, so "sync" is just a local mapping.
  syncContent: async (tmdbId: number, type: 'movie' | 'tv') => {
    return { success: true as const, data: { id: tmdbContentId(type, tmdbId) } }
  },

  // Lightweight enrichment for saved rows. Network/key failures return null so
  // offline entries remain visible, while a known maturity rejection is explicit
  // so callers can remove that row from the current view.
  getSummary: async (id: string): Promise<ContentSummary | null> => {
    const decoded = decodeTmdbContentId(id)
    if (!decoded) return null
    try {
      const c = client()
      const item = decoded.type === 'movie' ? await c.getMovie(decoded.tmdbId) : await c.getTv(decoded.tmdbId)
      const summary = toSummary({ ...item, media_type: decoded.type })
      const [filtered] = await applyCatalogMaturity([{ ...summary, durationMins: ('runtime' in item ? item.runtime : null) ?? summary.durationMins }], c)
      if (!filtered) throw new ContentRestrictedByMaturityError()
      return filtered
    } catch (error) {
      if (error instanceof ContentRestrictedByMaturityError) throw error
      return null
    }
  },
}
