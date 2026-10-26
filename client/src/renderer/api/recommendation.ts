// Local recommendations derived from TMDB (no ML backend).
import type { ContentSummary } from './catalog'
import { applyCatalogMaturity, catalogApi, tmdbItemsToSummaries } from './catalog'
import { createTmdbClient, decodeTmdbContentId } from '../lib/tmdb'
import { useSettingsStore } from '../store/settings'
import i18n from '../i18n'
import { rankRecommendations, selectRecommendationSeeds } from '../lib/personal-recommendations'

export interface RecommendationRow {
  id: string
  title: string
  items: ContentSummary[]
}

export const recommendationApi = {
  getPersonalized: async () => {
    const bridge = window.electronAPI
    if (!bridge || !useSettingsStore.getState().tmdbApiKey?.trim()) return { data: [] as ContentSummary[] }
    const [likes, watchlist, positions] = await Promise.all([
      bridge.likesList?.() ?? [], bridge.watchlistList(), bridge.positionList(),
    ])
    const seeds = selectRecommendationSeeds({ likes, watchlist, positions })
    const excluded = new Set([...likes, ...watchlist, ...positions].map(row => row.content_id))
    // At most six existing, cache-backed TMDB recommendation endpoints. Only seed
    // title IDs are used for catalog requests; the library itself stays on-device.
    const pools = await Promise.all(seeds.map(async seed => {
      try { return { weight: seed.weight, items: (await recommendationApi.getSimilar(seed.contentId)).data } }
      catch { return { weight: seed.weight, items: [] as ContentSummary[] } }
    }))
    return { data: rankRecommendations(pools, excluded) }
  },
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
    const c = createTmdbClient(key, i18n.language)
    const res = decoded.type === 'movie'
      ? await c.getSimilarMovies(decoded.tmdbId)
      : await c.getSimilarTv(decoded.tmdbId)
    // Tag media_type so the mapper produces the right ids/types.
    const tagged = res.results.map((i) => ({ ...i, media_type: decoded.type }))
    return { success: true as const, data: await applyCatalogMaturity(tmdbItemsToSummaries(tagged).slice(0, 20), c) }
  },

  getTrending: async () => {
    const res = await catalogApi.getTrending()
    return { success: true as const, data: res.data }
  },
}
