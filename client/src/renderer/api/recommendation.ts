import { recommendationClient } from './client'
import type { ContentSummary } from './catalog'

export interface RecommendationRow {
  id: string
  title: string
  items: ContentSummary[]
}

export const recommendationApi = {
  getHomeRows: (profileId: string) =>
    recommendationClient.get<{ success: true; data: RecommendationRow[] }>(
      '/recommendations/home',
      { profileId },
    ),

  getSimilar: (contentId: string, profileId: string) =>
    recommendationClient.get<{ success: true; data: ContentSummary[] }>(
      `/recommendations/similar/${contentId}`,
      { profileId },
    ),

  getTrending: () =>
    recommendationClient.get<{ success: true; data: ContentSummary[] }>('/recommendations/trending'),
}
