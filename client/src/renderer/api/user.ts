import { userClient } from './client'

export interface Profile {
  id: string
  accountId: string
  name: string
  avatarUrl: string | null
  isKids: boolean
  maturityRating: string
  language: string
  autoplay: boolean
  subtitleDefault: string | null
  createdAt: string
}

export interface CreateProfilePayload {
  name: string
  isKids?: boolean
  language?: string
  maturityRating?: 'G' | 'PG' | 'PG-13' | 'R' | 'TV-MA'
}

export interface UpdateProfilePayload {
  name?: string
  isKids?: boolean
  language?: string
  maturityRating?: 'G' | 'PG' | 'PG-13' | 'R' | 'TV-MA'
  autoplay?: boolean
  subtitleDefault?: string | null
  avatarUrl?: string | null
}

export interface WatchlistItem {
  profileId: string
  contentId: string
  addedAt: string
  contentType: string
  title?: string
  s3Thumbnail?: string | null
  backdropUrl?: string | null
  releaseYear?: number | null
}

export interface HistoryItem {
  profileId: string
  watchedAtContentId: string
  contentId: string
  contentTitle: string
  contentType: string
  thumbnailUrl: string | null
  positionSeconds: number
  durationSeconds: number
  completedAt: string | null
  watchedAt: string
  episodeId?: string | null
  episodeNumber?: number
  seasonNumber?: number
  episodeTitle?: string
}

export interface Preferences {
  language: string
  subtitleDefault: string | null
  autoplay: boolean
  maturityRating: string
  isKids: boolean
}

export const userApi = {
  // ─── Profiles ────────────────────────────────────────────────────────────────
  listProfiles: () =>
    userClient.get<{ success: true; data: Profile[] }>('/user/profiles'),

  createProfile: (payload: CreateProfilePayload) =>
    userClient.post<{ success: true; data: Profile }>('/user/profiles', payload),

  updateProfile: (id: string, payload: UpdateProfilePayload) =>
    userClient.put<{ success: true; data: Profile }>(`/user/profiles/${id}`, payload),

  deleteProfile: (id: string) =>
    userClient.delete<{ success: true; data: null }>(`/user/profiles/${id}`),

  // ─── Watchlist ────────────────────────────────────────────────────────────────
  getWatchlist: (profileId: string) =>
    userClient.get<{ success: true; data: WatchlistItem[] }>('/user/watchlist', { profileId }),

  addToWatchlist: (contentId: string, contentType: string, profileId: string) =>
    userClient.post<{ success: true; data: null }>(`/user/watchlist/${contentId}`, { contentType }, { profileId }),

  removeFromWatchlist: (contentId: string, profileId: string) =>
    userClient.delete<{ success: true; data: null }>(`/user/watchlist/${contentId}`, { profileId }),

  checkWatchlist: (contentId: string, profileId: string) =>
    userClient.get<{ success: true; data: { inWatchlist: boolean } }>(`/user/watchlist/${contentId}/check`, { profileId }),

  // ─── History ──────────────────────────────────────────────────────────────────
  getHistory: (profileId: string, limit = 50, cursor?: string) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return userClient.get<{ success: true; data: HistoryItem[]; meta: { nextCursor?: string } }>(
      `/user/history?${params.toString()}`,
      { profileId },
    )
  },

  deleteHistoryItem: (watchedAtContentId: string, profileId: string) => {
    const params = new URLSearchParams({ watchedAtContentId })
    return userClient.delete<{ success: true; data: null }>(`/user/history?${params.toString()}`, { profileId })
  },

  // ─── Preferences ─────────────────────────────────────────────────────────────
  getPreferences: (profileId: string) =>
    userClient.get<{ success: true; data: Preferences }>('/user/preferences', { profileId }),

  updatePreferences: (payload: Partial<Omit<Preferences, 'isKids'>>, profileId: string) =>
    userClient.put<{ success: true; data: Preferences }>('/user/preferences', payload, { profileId }),

  // ─── Avatar ───────────────────────────────────────────────────────────────────
  presignAvatar: (contentType: string, filename: string, profileId: string) =>
    userClient.post<{ success: true; data: { uploadUrl: string; cdnUrl: string; s3Key: string; expiresIn: number } }>(
      '/user/avatar/presign',
      { contentType, filename },
      { profileId },
    ),

  confirmAvatar: (cdnUrl: string, profileId: string) =>
    userClient.put<{ success: true; data: { avatarUrl: string } }>('/user/avatar/confirm', { cdnUrl }, { profileId }),

  // ─── GDPR ─────────────────────────────────────────────────────────────────────
  exportData: () =>
    userClient.get<object>('/user/export'),
}
