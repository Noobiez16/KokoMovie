// Local playback tracking: resume positions and continue-watching live in local
// SQLite (via IPC). Actual streams are located by the provider framework in the
// main process; the "session" here is just a local handle for position tracking.
import { catalogApi } from './catalog'

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
    const active = rows.filter((r) => r.position_seconds > 0 && !r.completed_at && !isComplete(r.position_seconds, r.duration_seconds))
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
}
