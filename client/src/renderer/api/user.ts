// Local user data: profiles collapse to a single on-device profile; watchlist,
// history and preferences live in local SQLite (via IPC). Same exported shapes
// as before so pages/components are unchanged.
import { catalogApi } from './catalog'
import { dedupeByTitle } from './playback'
import { decodeTmdbEpisodeId } from '../lib/tmdb'
import { LOCAL_PROFILE, LOCAL_PROFILE_ID } from '../lib/local-identity'

export { LOCAL_PROFILE, LOCAL_PROFILE_ID }

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

const api = () => window.electronAPI!

export const userApi = {
  // ─── Profiles (single local profile) ──────────────────────────────────────
  listProfiles: async () => ({ success: true as const, data: [LOCAL_PROFILE] }),
  createProfile: async (_payload: CreateProfilePayload) => ({ success: true as const, data: LOCAL_PROFILE }),
  updateProfile: async (_id: string, _payload: UpdateProfilePayload) => ({ success: true as const, data: LOCAL_PROFILE }),
  deleteProfile: async (_id: string) => ({ success: true as const, data: null }),

  // ─── Watchlist ──────────────────────────────────────────────────────────────
  getWatchlist: async (_profileId?: string) => {
    const rows = await api().watchlistList()
    const items = await Promise.all(
      rows.map(async (r): Promise<WatchlistItem> => {
        const s = await catalogApi.getSummary(r.content_id)
        return {
          profileId: LOCAL_PROFILE_ID,
          contentId: r.content_id,
          addedAt: r.added_at,
          contentType: r.content_type,
          title: s?.title,
          s3Thumbnail: s?.s3Thumbnail ?? null,
          backdropUrl: s?.backdropUrl ?? null,
          releaseYear: s?.releaseYear ?? null,
        }
      }),
    )
    return { success: true as const, data: items }
  },

  addToWatchlist: async (contentId: string, contentType: string, _profileId?: string) => {
    await api().watchlistAdd(contentId, contentType)
    return { success: true as const, data: null }
  },

  removeFromWatchlist: async (contentId: string, _profileId?: string) => {
    await api().watchlistRemove(contentId)
    return { success: true as const, data: null }
  },

  checkWatchlist: async (contentId: string, _profileId?: string) => {
    const res = await api().watchlistHas(contentId)
    return { success: true as const, data: { inWatchlist: res.inWatchlist } }
  },

  // ─── History ──────────────────────────────────────────────────────────────
  getHistory: async (_profileId?: string, limit = 50, _cursor?: string) => {
    // One entry per title: collapse a series' episodes to the most advanced one watched
    // (e.g. after finishing 1–3 and jumping to 4, history shows S1:E4, not four rows).
    const rows = dedupeByTitle(await api().positionList()).slice(0, limit)
    const items = await Promise.all(
      rows.map(async (r): Promise<HistoryItem> => {
        const s = await catalogApi.getSummary(r.content_id)
        const ep = decodeTmdbEpisodeId(r.episode_id)
        return {
          profileId: LOCAL_PROFILE_ID,
          watchedAtContentId: `${r.content_id}:${r.episode_id}`,
          contentId: r.content_id,
          contentTitle: s?.title ?? 'Unknown',
          contentType: r.content_type,
          thumbnailUrl: s?.s3Thumbnail ?? s?.backdropUrl ?? null,
          positionSeconds: r.position_seconds,
          durationSeconds: r.duration_seconds,
          completedAt: r.completed_at,
          watchedAt: r.updated_at,
          episodeId: r.episode_id || null,
          ...(ep ? { seasonNumber: ep.season, episodeNumber: ep.episode } : {}),
        }
      }),
    )
    return { success: true as const, data: items, meta: { nextCursor: undefined as string | undefined } }
  },

  deleteHistoryItem: async (watchedAtContentId: string, _profileId?: string) => {
    const [contentId, episodeId] = watchedAtContentId.split(':')
    await api().positionDelete(contentId!, episodeId || null)
    return { success: true as const, data: null }
  },

  // ─── Preferences ─────────────────────────────────────────────────────────
  getPreferences: async (_profileId?: string) => {
    const p = await api().prefsGet()
    return {
      success: true as const,
      data: {
        language: p.language,
        subtitleDefault: p.subtitle_default,
        autoplay: !!p.autoplay,
        maturityRating: p.maturity_rating,
        isKids: false,
      } as Preferences,
    }
  },

  updatePreferences: async (payload: Partial<Omit<Preferences, 'isKids'>>, _profileId?: string) => {
    const p = await api().prefsSet({
      language: payload.language,
      subtitleDefault: payload.subtitleDefault,
      autoplay: payload.autoplay,
      maturityRating: payload.maturityRating,
    })
    return {
      success: true as const,
      data: {
        language: p.language,
        subtitleDefault: p.subtitle_default,
        autoplay: !!p.autoplay,
        maturityRating: p.maturity_rating,
        isKids: false,
      } as Preferences,
    }
  },

  // ─── Avatar / GDPR (no-ops in the local build) ─────────────────────────────
  presignAvatar: async (
    _contentType: string,
    _filename: string,
    _profileId?: string,
  ): Promise<{ success: true; data: { uploadUrl: string; cdnUrl: string; s3Key: string; expiresIn: number } }> => {
    throw new Error('Avatar upload is not available in the local build')
  },
  confirmAvatar: async (_cdnUrl: string, _profileId?: string) => ({ success: true as const, data: { avatarUrl: '' } }),
  exportData: async () => {
    const [watchlist, history, preferences] = await Promise.all([
      api().watchlistList(),
      api().positionList(),
      api().prefsGet(),
    ])
    return { watchlist, history, preferences }
  },
}
