import { playbackClient } from './client'

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

export const playbackApi = {
  createSession: (
    body: { contentId: string; episodeId?: string; s3HlsKey: string; drmKeyId?: string; durationSeconds: number },
    profileId: string
  ) =>
    playbackClient.post<{ success: true; data: PlaybackSession }>('/playback/session', body, { profileId }),

  heartbeat: (
    body: { contentId: string; episodeId?: string; sessionId: string; positionSeconds: number; durationSeconds: number; quality: string },
    profileId: string
  ) =>
    playbackClient.put<void>('/playback/position', body, { profileId }),

  getPosition: (contentId: string, episodeId: string | undefined, profileId: string) => {
    const qs = episodeId ? `?episodeId=${episodeId}` : ''
    return playbackClient.get<{ success: true; data: PlaybackPosition }>(
      `/playback/position/${contentId}${qs}`,
      { profileId }
    )
  },

  reportQuality: (
    body: { sessionId: string; contentId: string; episodeId?: string; quality: string; positionSeconds: number; durationSeconds: number; bandwidth?: number },
    profileId: string
  ) =>
    playbackClient.post<void>('/playback/quality-report', body, { profileId }),

  getContinueWatching: (profileId: string) =>
    playbackClient.get<{ success: true; data: ContinueWatchingItem[] }>(
      '/playback/continue-watching',
      { profileId },
    ),
}
