import { catalogClient } from './client'

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

export const catalogApi = {
  getHome: (params: { type?: string } = {}, profileId: string) => {
    const qs = new URLSearchParams()
    if (params.type) qs.set('type', params.type)
    return catalogClient.get<{ success: true; data: HomeData; meta: { requestId: string; timestamp: string; source?: CatalogSource } }>(
      `/catalog/browse/home?${qs}`,
      { profileId }
    )
  },

  browse: (params: { genre?: string; type?: string; year?: number; page?: number; limit?: number }, profileId: string) => {
    const qs = new URLSearchParams()
    if (params.genre) qs.set('genre', params.genre)
    if (params.type) qs.set('type', params.type)
    if (params.year) qs.set('year', String(params.year))
    if (params.page) qs.set('page', String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    return catalogClient.get<{ success: true; data: ContentSummary[]; meta: PaginatedMeta }>(
      `/catalog/browse?${qs}`,
      { profileId }
    )
  },

  getContent: (id: string, profileId: string) =>
    catalogClient.get<{ success: true; data: ContentDetail; meta: { requestId: string; timestamp: string } }>(
      `/catalog/content/${id}`,
      { profileId }
    ),

  search: (q: string, params: { type?: string; genres?: string; page?: number } = {}, profileId: string) => {
    const qs = new URLSearchParams({ q })
    if (params.type) qs.set('type', params.type)
    if (params.genres) qs.set('genres', params.genres)
    if (params.page) qs.set('page', String(params.page))
    return catalogClient.get<{ success: true; data: ContentSummary[]; meta: { requestId: string; timestamp: string; query: string; total: number } }>(
      `/catalog/search?${qs}`,
      { profileId }
    )
  },

  semanticSearch: (q: string, params: { type?: string; page?: number } = {}, profileId: string) => {
    const qs = new URLSearchParams({ q })
    if (params.type) qs.set('type', params.type)
    if (params.page) qs.set('page', String(params.page))
    return catalogClient.get<{ success: true; data: ContentSummary[]; meta: { query: string; expandedTerms: string[]; total: number } }>(
      `/catalog/search/semantic?${qs}`,
      { profileId }
    )
  },

  getTrending: (profileId: string) =>
    catalogClient.get<{ success: true; data: ContentSummary[] }>('/catalog/trending', { profileId }),

  getGenres: (profileId: string) =>
    catalogClient.get<{ success: true; data: Genre[] }>('/catalog/genres', { profileId }),

  syncContent: (tmdbId: number, type: 'movie' | 'tv') =>
    catalogClient.post<{ success: true; data: { id: string } }>(
      '/catalog/sync',
      { tmdbId, type },
    ),
}
