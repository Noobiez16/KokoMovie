/// <reference types="vite/client" />

interface LibraryImportPreview {
  watchlist: number
  positions: number
  artwork: number
  watchlistConflicts: number
  positionConflicts: number
  exportedAt: string
  appVersion: string
}
interface DiagnosticReport {
  format: 'kokomovie-diagnostics'
  schemaVersion: 1
  generatedAt: string
  application: { version: string; platform: string; arch: string; packaged: boolean }
  storage: { watchlistItems: number; savedPositions: number; downloadStates: Record<string, number> }
  events: Array<{ at: string; scope: string; event: string; detail?: string }>
  privacy: { excludes: string[] }
}


interface ElectronAPI {
  // Auth / Keychain
  getTmdbApiKey: (accountId: string) => Promise<string | null>
  setTmdbApiKey: (accountId: string, key: string) => Promise<void>
  clearTmdbApiKey: (accountId: string) => Promise<void>
  validateTmdbApiKey: (key: string) => Promise<boolean>
  tmdbRequest: (path: string, params?: Record<string, string>) => Promise<{ body: string; source: 'network' | 'cache'; stale: boolean; fetchedAt: string | null }>
  searchDownloadedCatalog: (query: string) => Promise<Array<{ id: string; title: string; type: 'movie' | 'series'; releaseYear: number | null; rating: string | null; imdbScore: string | null; durationMins: number | null; s3Thumbnail: string | null; backdropUrl: string | null; imdbId: string | null; tmdbId: number | null; planMinimum: string }>>
  getTmdbCacheStats: () => Promise<{ entries: number; bytes: number }>
  clearTmdbCache: () => Promise<{ removed: number }>

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
    subtitles?: Array<{ lang: string; url: string }>
  }) => Promise<{ id: string; expiresAt: string }>
  cancelDownload: (id: string) => Promise<boolean>
  pauseDownload: (id: string) => Promise<{ ok: boolean; reason?: string }>
  resumeDownload: (id: string) => Promise<{ ok: boolean; reason?: string }>
  deleteDownload: (id: string) => Promise<boolean>
  listDownloads: () => Promise<unknown[]>
  getOfflineManifest: (id: string) => Promise<{ manifestContent: string; drmKeyId: string | null; subtitles: Array<{ id: number; name: string; lang: string; url: string }> } | null>
  selectDirectory: () => Promise<string | null>
  openDownloadFolder: (id?: string) => Promise<{ ok: boolean; error?: string }>
  getDefaultDownloadsDir: () => Promise<string>
  onDownloadProgress: (
    callback: (progress: {
      id: string
      percent: number
      status?: 'pending' | 'downloading' | 'completed' | 'cancelled' | 'error'
      completedSegments?: number
      totalSegments?: number
      downloadedBytes?: number
      totalBytes?: number
      errorMessage?: string
    }) => void,
  ) => () => void

  // App
  getAppVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  setApplicationLocale: (locale: 'en-US' | 'es-ES' | 'fr-FR') => Promise<{ locale: 'en-US' | 'es-ES' | 'fr-FR' }>
  onHelpAction: (callback: (action: 'documentation' | 'feedback') => void) => () => void
  onUpdateAvailable: (callback: (version?: string) => void) => () => void
  onUpdateDownloaded: (callback: (version?: string) => void) => () => void
  installUpdate: () => Promise<void>
  getAutoUpdateEnabled: () => Promise<boolean>
  setAutoUpdateEnabled: (enabled: boolean) => Promise<boolean>
  checkForUpdates: () => Promise<{ status: 'available' | 'not-available' | 'error' | 'dev'; version?: string; message?: string }>
  setDiscordActivity: (activity: { title: string; episode?: string; startedAt?: number } | null) => Promise<{ ok: boolean; reason?: string }>

  // OAuth

  // API proxy
  apiRequest: (opts: { url: string; method: 'GET'; headers: Record<string, string> }) =>
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
  prefsGet: () => Promise<{ language: string; subtitle_default: string | null; autoplay: number; maturity_rating: string; source_discovery_mode: 'progressive' | 'complete' }>
  prefsSet: (p: { language?: string; subtitleDefault?: string | null; autoplay?: boolean; maturityRating?: string; sourceDiscoveryMode?: 'progressive' | 'complete' }) => Promise<{ language: string; subtitle_default: string | null; autoplay: number; maturity_rating: string; source_discovery_mode: 'progressive' | 'complete' }>
  exportLibraryFile: (input: { includeArtwork: boolean }) => Promise<{ cancelled: boolean; path?: string; counts?: { watchlist: number; positions: number; artwork: number } }>
  selectLibraryImport: () => Promise<{ cancelled: boolean; token?: string; preview?: LibraryImportPreview }>
  applyLibraryImport: (input: { token: string; mode: 'merge' | 'replace' }) => Promise<{ ok: boolean; mode: 'merge' | 'replace'; backupPath: string; watchlist: number; positions: number; artwork: number }>
  previewDiagnostics: () => Promise<{ token: string; report: DiagnosticReport }>
  saveDiagnostics: (input: { token: string }) => Promise<{ cancelled: boolean }>

  // Providers
  listProviders: () => Promise<Array<{ id: string; name: string; enabled: boolean; failures: number; circuitOpen: boolean }>>
  toggleProvider: (id: string, enabled: boolean) => Promise<{ ok: boolean }>
  getStream: (providerId: string, req: StreamRequest) => Promise<ProviderResult>
  getFirstStream: (req: StreamRequest, searchId?: string) => Promise<ProviderResult | null>
  onStreamsCollected: (
    callback: (payload: { searchId: string; allStreams: ProviderResult[]; sourceStatuses?: ProviderSourceStatus[] }) => void
  ) => () => void
  registerStreamHeaders: (streamUrl: string, headers: Record<string, string>) => Promise<{ ok: boolean }>
  getProxyPort: () => Promise<number>

  // Built-in P2P torrent streaming (free dub sourcing)
  torrentGetStreams: (req: StreamRequest) => Promise<ProviderResult[]>
  // `audioLang` is the language that will actually be audible (verified against the file's real
  // audio streams), which can differ from the requested one when a release advertises a dub it
  // only carries as subtitles. `audioLangs` is the probed stream list; empty when unreadable.
  torrentResolve: (magnet: string, audioLang?: string) => Promise<{ url?: string; transcoded?: boolean; audioLang?: string; requestedLang?: string; audioLangs?: string[]; error?: string }>
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
  qualityInfo?: StreamQuality
  headers?: Record<string, string>
  audioLangs?: string[]
}

interface ProviderResult {
  providerId: string
  providerName: string
  streams: StreamSource[]
  error?: string
  allStreams?: ProviderResult[]
  sourceStatuses?: ProviderSourceStatus[]
}

interface StreamQuality {
  resolution: number
  resolutionLabel: string
  releaseType: 'standard' | 'cam' | 'telesync' | 'unknown'
  confidence: 'verified' | 'declared' | 'inferred' | 'unknown'
  displayLabel: string
  mediaValidated: boolean
}

interface ProviderSourceStatus {
  providerId: string
  providerName: string
  state: 'searching' | 'available' | 'unavailable' | 'timed-out'
  qualityInfo?: StreamQuality
  error?: string
}

interface Window {
  electronAPI?: ElectronAPI
}
