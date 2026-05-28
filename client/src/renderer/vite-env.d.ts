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

  // OAuth
  onOAuthCallback: (callback: (url: string) => void) => () => void

  // API proxy
  apiRequest: (opts: { url: string; method: string; headers: Record<string, string>; body?: string }) =>
    Promise<{ ok: boolean; status: number; body: string }>

  // Providers
  listProviders: () => Promise<Array<{ id: string; name: string; enabled: boolean }>>
  toggleProvider: (id: string, enabled: boolean) => Promise<{ ok: boolean }>
  getStream: (providerId: string, req: StreamRequest) => Promise<ProviderResult>
  getFirstStream: (req: StreamRequest) => Promise<ProviderResult | null>
  registerStreamHeaders: (streamUrl: string, headers: Record<string, string>) => Promise<{ ok: boolean }>
  getProxyPort: () => Promise<number>
}

interface StreamRequest {
  imdbId?: string
  tmdbId?: number
  type: 'movie' | 'tv'
  season?: number
  episode?: number
  title?: string
}

interface StreamSource {
  url: string
  quality: string
  headers?: Record<string, string>
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
