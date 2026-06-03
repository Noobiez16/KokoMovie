// Local recommendations derived from TMDB (no ML backend).
import type { ContentSummary } from './catalog'
import { catalogApi, tmdbItemsToSummaries } from './catalog'
import { createTmdbClient, decodeTmdbContentId } from '../lib/tmdb'
import { useSettingsStore } from '../store/settings'

export interface RecommendationRow {
  id: string
  title: string
  items: ContentSummary[]
}

export const recommendationApi = {
  getHomeRows: async (_profileId?: string) => {
    const home = await catalogApi.getHome({})
    const rows: RecommendationRow[] = [
      { id: 'trending', title: 'Trending Now', items: home.data.trending },
      ...home.data.rows.map((r) => ({ id: r.genre.slug, title: r.genre.name, items: r.items })),
    ].filter((r) => r.items.length > 0)
    return { success: true as const, data: rows }
  },

  getSimilar: async (contentId: string, _profileId?: string) => {
    const decoded = decodeTmdbContentId(contentId)
    const key = useSettingsStore.getState().tmdbApiKey?.trim()
    if (!decoded || !key) return { success: true as const, data: [] as ContentSummary[] }
    const c = createTmdbClient(key)
    const res = decoded.type === 'movie'
      ? await c.getSimilarMovies(decoded.tmdbId)
      : await c.getSimilarTv(decoded.tmdbId)
    // Tag media_type so the mapper produces the right ids/types.
    const tagged = res.results.map((i) => ({ ...i, media_type: decoded.type }))
    return { success: true as const, data: tmdbItemsToSummaries(tagged).slice(0, 20) }
  },

  getTrending: async () => {
    const res = await catalogApi.getTrending()
    return { success: true as const, data: res.data }
  },
}
