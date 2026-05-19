import { config } from '../config.js'

export interface ContentItem {
  id: string
  title: string
  type: string
  genres: Array<{ id: string; name: string }>
  imdbScore: string | null
  releaseYear: number | null
  rating: string | null
  s3Thumbnail: string | null
  planMinimum: string
}

async function fetchFromCatalog(path: string): Promise<ContentItem[]> {
  try {
    const res = await fetch(`${config.CATALOG_SERVICE_URL}${path}`, {
      headers: { 'X-Client-Version': '1.0.0' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return []
    const json = await res.json() as { success: boolean; data: ContentItem[] }
    return json.success ? json.data : []
  } catch {
    return []
  }
}

// ─── User Personalisation ─────────────────────────────────────────────────────

export async function getPersonalizedItems(profileId: string, limit = 20): Promise<ContentItem[]> {
  if (config.PERSONALIZE_CAMPAIGN_ARN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { PersonalizeRuntimeClient, GetRecommendationsCommand } = await import('@aws-sdk/client-personalize-runtime' as any)
      const client = new PersonalizeRuntimeClient({ region: config.AWS_REGION })
      const result = await client.send(new GetRecommendationsCommand({
        campaignArn: config.PERSONALIZE_CAMPAIGN_ARN,
        userId: profileId,
        numResults: limit,
      }))
      const ids: string[] = ((result.itemList ?? []) as Array<{ itemId?: string }>)
        .map((i) => i.itemId)
        .filter((id): id is string => !!id)
      if (ids.length > 0) {
        return fetchFromCatalog(`/catalog/browse?ids=${ids.join(',')}&limit=${limit}`)
      }
    } catch { /* fall through to dev fallback */ }
  }
  return fetchFromCatalog(`/catalog/trending?limit=${limit}`)
}

// ─── Similar Items ────────────────────────────────────────────────────────────

export async function getSimilarItems(contentId: string, limit = 12): Promise<ContentItem[]> {
  if (config.PERSONALIZE_SIMILAR_CAMPAIGN_ARN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { PersonalizeRuntimeClient, GetRecommendationsCommand } = await import('@aws-sdk/client-personalize-runtime' as any)
      const client = new PersonalizeRuntimeClient({ region: config.AWS_REGION })
      const result = await client.send(new GetRecommendationsCommand({
        campaignArn: config.PERSONALIZE_SIMILAR_CAMPAIGN_ARN,
        itemId: contentId,
        numResults: limit,
      }))
      const ids: string[] = ((result.itemList ?? []) as Array<{ itemId?: string }>)
        .map((i) => i.itemId)
        .filter((id): id is string => !!id)
      if (ids.length > 0) {
        return fetchFromCatalog(`/catalog/browse?ids=${ids.join(',')}&limit=${limit}`)
      }
    } catch { /* fall through to dev fallback */ }
  }
  const items = await fetchFromCatalog(`/catalog/trending?limit=${limit + 1}`)
  return items.filter((i) => i.id !== contentId).slice(0, limit)
}

// ─── Trending ─────────────────────────────────────────────────────────────────

export async function getTrendingItems(limit = 20): Promise<ContentItem[]> {
  return fetchFromCatalog(`/catalog/trending?limit=${limit}`)
}
