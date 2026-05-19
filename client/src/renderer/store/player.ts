import { create } from 'zustand'

type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error'

interface PlayerState {
  contentId: string | null
  episodeId: string | null
  title: string
  status: PlayerStatus
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  quality: string | null
  subtitleTrack: string | null
  isFullscreen: boolean
  isPip: boolean

  setContent: (contentId: string, episodeId: string | null, title: string) => void
  setStatus: (status: PlayerStatus) => void
  setTime: (current: number, duration: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setQuality: (quality: string | null) => void
  setSubtitleTrack: (track: string | null) => void
  setFullscreen: (fullscreen: boolean) => void
  setPip: (pip: boolean) => void
  reset: () => void
}

const initialState = {
  contentId: null,
  episodeId: null,
  title: '',
  status: 'idle' as PlayerStatus,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  quality: null,
  subtitleTrack: null,
  isFullscreen: false,
  isPip: false,
}

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,

  setContent: (contentId, episodeId, title) =>
    set({ contentId, episodeId, title, status: 'loading', currentTime: 0 }),

  setStatus: (status) => set({ status }),

  setTime: (currentTime, duration) => set({ currentTime, duration }),

  setVolume: (volume) => set({ volume, muted: volume === 0 }),

  toggleMute: () => set((s) => ({ muted: !s.muted })),

  setQuality: (quality) => set({ quality }),

  setSubtitleTrack: (subtitleTrack) => set({ subtitleTrack }),

  setFullscreen: (isFullscreen) => set({ isFullscreen }),

  setPip: (isPip) => set({ isPip }),

  reset: () => set(initialState),
}))
