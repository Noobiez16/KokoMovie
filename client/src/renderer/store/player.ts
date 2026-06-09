import { create } from 'zustand'

// A collected provider stream (mirrors the shape VideoPlayer/ContentDetail already use).
export interface CachedStream {
  providerId: string
  providerName: string
  streams: Array<{ url: string; quality: string; headers?: Record<string, string>; audioLangs?: string[] }>
}

// Everything the global PlayerHost needs to render playback. This is the single source of
// truth for "what is playing", lifted out of the /player route so the player can persist
// across navigation (and shrink into Picture-in-Picture) without unmounting.
export interface PlaybackRequest {
  contentId: string
  episodeId?: string
  streamUrl?: string
  streamHeaders?: Record<string, string>
  providerId?: string
  allStreams?: CachedStream[]
  resumeAtSeconds?: number
  offlineId?: string
  // Correlates this playback with its background source-collection event
  // (providers:streamsCollected) so late-arriving mirrors are merged into THIS request only.
  searchId?: string
}

export type PlayerMode = 'full' | 'pip'

interface PlayerState {
  request: PlaybackRequest | null
  mode: PlayerMode
  // Bumped on every brand-new play() so the host can (re)build a session even when two
  // requests look similar. patchRequest() (next episode etc.) deliberately does NOT bump it.
  launchToken: number

  /** Start a fresh playback (always opens fullscreen). */
  play: (req: PlaybackRequest) => void
  /** Update fields of the active request in place (e.g. advancing to the next episode). */
  patchRequest: (patch: Partial<PlaybackRequest>) => void
  setMode: (mode: PlayerMode) => void
  enterPip: () => void
  exitPip: () => void
  /** Tear playback down entirely (unmounts the player, which saves the final position). */
  stop: () => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  request: null,
  mode: 'full',
  launchToken: 0,

  play: (req) => set((s) => ({ request: req, mode: 'full', launchToken: s.launchToken + 1 })),
  patchRequest: (patch) => set((s) => (s.request ? { request: { ...s.request, ...patch } } : {})),
  setMode: (mode) => set({ mode }),
  enterPip: () => set({ mode: 'pip' }),
  exitPip: () => set({ mode: 'full' }),
  stop: () => set({ request: null, mode: 'full' }),
}))
