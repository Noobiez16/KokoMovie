// Local playback tracking: resume positions and continue-watching live in local
// SQLite (via IPC). Actual streams are located by the provider framework in the
// main process; the "session" here is just a local handle for position tracking.
import { catalogApi } from './catalog'
import { episodeRank } from '../lib/tmdb'

export interface PositionRowLite {
  content_id: string
  episode_id: string
  position_seconds: number
  duration_seconds: number
  completed_at: string | null
  updated_at: string
  content_type?: string
}

// Collapse multiple per-episode rows of the same title down to one — the most
// advanced episode (highest season/episode), tie-broken by most recent activity.
// Keeps a series from appearing once per watched episode in Continue Watching / History.
export function dedupeByTitle<T extends PositionRowLite>(rows: T[]): T[] {
  const byContent = new Map<string, T>()
  for (const r of rows) {
    const cur = byContent.get(r.content_id)
    if (!cur) { byContent.set(r.content_id, r); continue }
    const rRank = episodeRank(r.episode_id)
    const curRank = episodeRank(cur.episode_id)
    if (rRank > curRank || (rRank === curRank && r.updated_at > cur.updated_at)) {
      byContent.set(r.content_id, r)
    }
  }
  return [...byContent.values()].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
}

export interface PlaybackSession {
  sessionId: string
  manifestUrl: string
  drmKeyId: string | null
  expiresIn: number
}

export interface PlaybackPosition {
  positionSeconds: number
  durationSeconds: number
  completedAt: string | null
}

export interface ContinueWatchingItem {
  contentId: string
  episodeId: string | null
  positionSeconds: number
  durationSeconds: number
  contentEpisodeId: string
  updatedAt: string
  title: string
  type: 'movie' | 'series'
  s3Thumbnail: string | null
  backdropUrl: string | null
  releaseYear: number | null
}

const api = () => window.electronAPI!

// A title counts as "finished" (and drops off continue-watching) past 92%.
function isComplete(position: number, duration: number): boolean {
  return duration > 0 && position >= duration * 0.92
}

export const playbackApi = {
  createSession: async (
    body: { contentId: string; episodeId?: string; s3HlsKey: string; drmKeyId?: string; durationSeconds: number },
    _profileId?: string,
  ) => {
    return {
      success: true as const,
      data: {
        sessionId: crypto.randomUUID(),
        manifestUrl: '',
        drmKeyId: body.drmKeyId ?? null,
        expiresIn: 14400,
      } as PlaybackSession,
    }
  },

  heartbeat: async (
    body: { contentId: string; episodeId?: string; sessionId: string; positionSeconds: number; durationSeconds: number; quality: string },
    _profileId?: string,
  ) => {
    await api().positionSave({
      contentId: body.contentId,
      episodeId: body.episodeId ?? null,
      positionSeconds: body.positionSeconds,
      durationSeconds: body.durationSeconds,
      completed: isComplete(body.positionSeconds, body.durationSeconds),
    })
  },

  getPosition: async (contentId: string, episodeId: string | undefined, _profileId?: string) => {
    const row = await api().positionGet(contentId, episodeId ?? null)
    return {
      success: true as const,
      data: {
        positionSeconds: row?.position_seconds ?? 0,
        durationSeconds: row?.duration_seconds ?? 0,
        completedAt: row?.completed_at ?? null,
      } as PlaybackPosition,
    }
  },

  reportQuality: async (
    _body: { sessionId: string; contentId: string; episodeId?: string; quality: string; positionSeconds: number; durationSeconds: number; bandwidth?: number },
    _profileId?: string,
  ) => {
    // No telemetry in the local build.
  },

  getContinueWatching: async (_profileId?: string) => {
    const rows = await api().positionList()
    const active = dedupeByTitle(
      rows.filter((r) => r.position_seconds > 0 && !r.completed_at && !isComplete(r.position_seconds, r.duration_seconds)),
    )
    const items = (
      await Promise.all(
        active.map(async (r): Promise<ContinueWatchingItem | null> => {
          const s = await catalogApi.getSummary(r.content_id)
          if (!s) return null
          return {
            contentId: r.content_id,
            episodeId: r.episode_id || null,
            positionSeconds: r.position_seconds,
            durationSeconds: r.duration_seconds,
            contentEpisodeId: `${r.content_id}:${r.episode_id}`,
            updatedAt: r.updated_at,
            title: s.title,
            type: s.type,
            s3Thumbnail: s.s3Thumbnail,
            backdropUrl: s.backdropUrl,
            releaseYear: s.releaseYear,
          }
        }),
      )
    ).filter((x): x is ContinueWatchingItem => x !== null)
    return { success: true as const, data: items }
  },

  deletePosition: async (contentId: string, episodeId: string | null | undefined, _profileId?: string) => {
    await api().positionDelete(contentId, episodeId ?? null)
    return { success: true as const, data: null }
  },

  // Remove an entire title from Continue Watching — clears every in-progress position row
  // for the content (so it leaves both Continue Watching and Viewing History's In-Progress).
  removeFromContinueWatching: async (contentId: string, _profileId?: string) => {
    await api().positionDeleteContent(contentId)
    return { success: true as const, data: null }
  },
}
