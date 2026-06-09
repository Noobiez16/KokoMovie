/// <reference types="vite/client" />

interface ElectronAPI {
  // Auth / Keychain
  getAuthToken: () => Promise<string | null>
  setAuthToken: (token: string) => Promise<void>
  clearAuthToken: () => Promise<void>
  getRefreshToken: () => Promise<string | null>
  setRefreshToken: (token: string, persist?: boolean) => Promise<void>
  getTmdbApiKey: (accountId: string) => Promise<string | null>
  setTmdbApiKey: (accountId: string, key: string) => Promise<void>
  clearTmdbApiKey: (accountId: string) => Promise<void>

  // Downloads
  downloadContent: (opts: {
    contentId: string
    episodeId?: string
    title: string
    contentType: string
    thumbnailUrl?: string
    durationMins?: number
    manifestUrl: string
    drmKeyId?: string
    customDownloadPath?: string
    headers?: Record<string, string>
  }) => Promise<{ id: string; expiresAt: string }>
  cancelDownload: (id: string) => Promise<boolean>
  deleteDownload: (id: string) => Promise<boolean>
  listDownloads: () => Promise<unknown[]>
  getOfflineManifest: (id: string) => Promise<{ manifestContent: string; drmKeyId: string | null } | null>
  selectDirectory: () => Promise<string | null>
  getDefaultDownloadsDir: () => Promise<string>
  onDownloadProgress: (
    callback: (progress: {
      id: string
      percent: number
      status?: 'pending' | 'downloading' | 'completed' | 'cancelled' | 'error'
      completedSegments?: number
      totalSegments?: number
      errorMessage?: string
    }) => void,
  ) => () => void

  // App
  getAppVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  onUpdateAvailable: (callback: (version?: string) => void) => () => void
  onUpdateDownloaded: (callback: (version?: string) => void) => () => void
  installUpdate: () => Promise<void>
  getAutoUpdateEnabled: () => Promise<boolean>
  setAutoUpdateEnabled: (enabled: boolean) => Promise<boolean>
  checkForUpdates: () => Promise<{ status: 'available' | 'not-available' | 'error' | 'dev'; version?: string; message?: string }>

  // OAuth
  onOAuthCallback: (callback: (url: string) => void) => () => void

  // API proxy
  apiRequest: (opts: { url: string; method: string; headers: Record<string, string>; body?: string }) =>
    Promise<{ ok: boolean; status: number; body: string }>

  // Local library
  watchlistList: () => Promise<Array<{ content_id: string; content_type: string; added_at: string }>>
  watchlistAdd: (contentId: string, contentType: string) => Promise<{ ok: boolean }>
  watchlistRemove: (contentId: string) => Promise<{ ok: boolean }>
  watchlistHas: (contentId: string) => Promise<{ inWatchlist: boolean }>
  positionSave: (p: { contentId: string; episodeId?: string | null; contentType?: string; positionSeconds: number; durationSeconds: number; completed?: boolean }) => Promise<{ ok: boolean }>
  positionGet: (contentId: string, episodeId?: string | null) => Promise<{ content_id: string; episode_id: string; content_type: string; position_seconds: number; duration_seconds: number; completed_at: string | null; updated_at: string } | null>
  positionList: () => Promise<Array<{ content_id: string; episode_id: string; content_type: string; position_seconds: number; duration_seconds: number; completed_at: string | null; updated_at: string }>>
  positionDelete: (contentId: string, episodeId?: string | null) => Promise<{ ok: boolean }>
  positionDeleteContent: (contentId: string) => Promise<{ ok: boolean }>
  prefsGet: () => Promise<{ language: string; subtitle_default: string | null; autoplay: number; maturity_rating: string }>
  prefsSet: (p: { language?: string; subtitleDefault?: string | null; autoplay?: boolean; maturityRating?: string }) => Promise<{ language: string; subtitle_default: string | null; autoplay: number; maturity_rating: string }>

  // Providers
  listProviders: () => Promise<Array<{ id: string; name: string; enabled: boolean }>>
  toggleProvider: (id: string, enabled: boolean) => Promise<{ ok: boolean }>
  getStream: (providerId: string, req: StreamRequest) => Promise<ProviderResult>
  getFirstStream: (req: StreamRequest, searchId?: string) => Promise<ProviderResult | null>
  onStreamsCollected: (
    callback: (payload: { searchId: string; allStreams: ProviderResult[] }) => void
  ) => () => void
  registerStreamHeaders: (streamUrl: string, headers: Record<string, string>) => Promise<{ ok: boolean }>
  getProxyPort: () => Promise<number>

  // Built-in P2P torrent streaming (free dub sourcing)
  torrentGetStreams: (req: StreamRequest) => Promise<ProviderResult[]>
  torrentResolve: (magnet: string, audioLang?: string) => Promise<{ url?: string; transcoded?: boolean; error?: string }>
}

interface StreamRequest {
  imdbId?: string
  tmdbId?: number
  type: 'movie' | 'tv'
  season?: number
  episode?: number
  title?: string
  // Optional preferred audio/dub language (ISO 639-1). See providers/interface.ts.
  audioLang?: string
}

interface StreamSource {
  url: string
  quality: string
  headers?: Record<string, string>
  audioLangs?: string[]
}

interface ProviderResult {
  providerId: string
  providerName: string
  streams: StreamSource[]
  error?: string
  allStreams?: ProviderResult[]
}

interface Window {
  electronAPI?: ElectronAPI
}
