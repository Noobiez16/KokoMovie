import { decodeTmdbContentId } from './tmdb'

interface Interest { content_id: string }
export interface RecommendationSignals {
  likes: Array<Interest & { updated_at: string }>
  watchlist: Array<Interest & { added_at: string }>
  positions: Array<Interest & { position_seconds: number; duration_seconds: number; completed_at: string | null; updated_at: string }>
}
export interface RecommendationSeed { contentId: string; weight: number }

/** One vote per title, with explicit likes stronger than passive viewing. */
export function selectRecommendationSeeds(signals: RecommendationSignals, now = Date.now()): RecommendationSeed[] {
  const weights = new Map<string, number>()
  const add = (id: string, timestamp: string, strength: number) => {
    const time = Date.parse(timestamp)
    if (!decodeTmdbContentId(id) || !Number.isFinite(time)) return
    const ageDays = Math.max(0, now - time) / 86_400_000
    const weight = strength / (1 + ageDays / 90)
    weights.set(id, Math.max(weights.get(id) ?? 0, weight))
  }
  for (const row of signals.likes) add(row.content_id, row.updated_at, 8)
  for (const row of signals.watchlist) add(row.content_id, row.added_at, 3)
  for (const row of signals.positions) {
    const meaningful = row.completed_at || row.position_seconds >= 300
      || (row.position_seconds >= 120 && row.duration_seconds > 0 && row.position_seconds / row.duration_seconds >= .2)
    if (meaningful) add(row.content_id, row.updated_at, row.completed_at ? 5 : 4)
  }
  return [...weights].map(([contentId, weight]) => ({ contentId, weight }))
    .sort((a, b) => b.weight - a.weight || a.contentId.localeCompare(b.contentId)).slice(0, 6)
}

/** Weighted rank fusion; repeated results in one feed never count as extra votes. */
export function rankRecommendations<T extends { id: string }>(
  pools: Array<{ weight: number; items: T[] }>, excluded: ReadonlySet<string>,
): T[] {
  const candidates = new Map<string, { item: T; score: number; order: number }>()
  for (const pool of pools) {
    const seen = new Set<string>()
    pool.items.forEach((item, index) => {
      if (excluded.has(item.id) || seen.has(item.id)) return
      seen.add(item.id)
      const current = candidates.get(item.id) ?? { item, score: 0, order: candidates.size }
      current.score += pool.weight / (index + 5)
      candidates.set(item.id, current)
    })
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 20).map(candidate => candidate.item)
}
