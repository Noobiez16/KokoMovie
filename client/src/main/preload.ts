import { contextBridge, ipcRenderer } from 'electron'

// E1-S2: Expose ONLY whitelisted APIs via contextBridge — no direct Node.js access
contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Auth / Keychain ──────────────────────────────────────────────────────
  getTmdbApiKey: (accountId: string) => ipcRenderer.invoke('keychain:get-tmdb-key', accountId),
  setTmdbApiKey: (accountId: string, key: string) => ipcRenderer.invoke('keychain:set-tmdb-key', accountId, key),
  clearTmdbApiKey: (accountId: string) => ipcRenderer.invoke('keychain:clear-tmdb-key', accountId),
  validateTmdbApiKey: (key: string) => ipcRenderer.invoke('tmdb:validate-credential', key),
  tmdbRequest: (path: string, params: Record<string, string> = {}) => ipcRenderer.invoke('tmdb:request', { path, params }),
  searchDownloadedCatalog: (query: string) => ipcRenderer.invoke('tmdb:search-downloads', query),
  getTmdbCacheStats: () => ipcRenderer.invoke('tmdb:cache:stats'),
  clearTmdbCache: () => ipcRenderer.invoke('tmdb:cache:clear'),

  // ─── Downloads ────────────────────────────────────────────────────────────
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
  }) => ipcRenderer.invoke('download:start', opts),
  cancelDownload: (id: string) => ipcRenderer.invoke('download:cancel', id),
  pauseDownload: (id: string) => ipcRenderer.invoke('download:pause', id),
  resumeDownload: (id: string) => ipcRenderer.invoke('download:resume', id),
  deleteDownload: (id: string) => ipcRenderer.invoke('download:delete', id),
  listDownloads: () => ipcRenderer.invoke('download:list'),
  getOfflineManifest: (id: string) => ipcRenderer.invoke('download:get-manifest', id),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  openDownloadFolder: (id?: string) => ipcRenderer.invoke('download:open-folder', id),
  getDefaultDownloadsDir: () => ipcRenderer.invoke('download:get-default-dir'),
  onDownloadProgress: (
    callback: (progress: {
      id: string
      percent: number
      status?: string
      completedSegments?: number
      totalSegments?: number
      downloadedBytes?: number
      totalBytes?: number
      errorMessage?: string
    }) => void
  ) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      progress: {
        id: string
        percent: number
        status?: string
        completedSegments?: number
        totalSegments?: number
        downloadedBytes?: number
        totalBytes?: number
        errorMessage?: string
      }
    ) => callback(progress)
    ipcRenderer.on('download:progress', handler)
    return () => ipcRenderer.removeListener('download:progress', handler)
  },

  // ─── App ──────────────────────────────────────────────────────────────────
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  setApplicationLocale: (locale: 'en-US' | 'es-ES' | 'fr-FR') => ipcRenderer.invoke('app:set-locale', locale),
  onHelpAction: (callback: (action: 'documentation' | 'feedback') => void) => {
    const handler = (_: Electron.IpcRendererEvent, action: 'documentation' | 'feedback') => callback(action)
    ipcRenderer.on('help:action', handler)
    return () => ipcRenderer.removeListener('help:action', handler)
  },
  onUpdateAvailable: (callback: (version?: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, version?: string) => callback(version)
    ipcRenderer.on('update:available', handler)
    return () => ipcRenderer.removeListener('update:available', handler)
  },
  onUpdateDownloaded: (callback: (version?: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, version?: string) => callback(version)
    ipcRenderer.on('update:downloaded', handler)
    return () => ipcRenderer.removeListener('update:downloaded', handler)
  },
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  getAutoUpdateEnabled: () => ipcRenderer.invoke('app:get-auto-update'),
  setAutoUpdateEnabled: (enabled: boolean) => ipcRenderer.invoke('app:set-auto-update', enabled),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  setDiscordActivity: (activity: { title: string; episode?: string; startedAt?: number } | null) =>
    ipcRenderer.invoke('discord:set-activity', activity),


  // ─── API proxy (bypasses file:// CORS restrictions) ─────────────────────
  apiRequest: (opts: { url: string; method: 'GET'; headers: Record<string, string> }) =>
    ipcRenderer.invoke('api:request', opts),

  // ─── Local library (watchlist, resume positions, preferences) ────────────
  watchlistList: () => ipcRenderer.invoke('library:watchlist:list'),
  watchlistAdd: (contentId: string, contentType: string) => ipcRenderer.invoke('library:watchlist:add', contentId, contentType),
  watchlistRemove: (contentId: string) => ipcRenderer.invoke('library:watchlist:remove', contentId),
  watchlistHas: (contentId: string) => ipcRenderer.invoke('library:watchlist:has', contentId),
  positionSave: (p: { contentId: string; episodeId?: string | null; contentType?: string; positionSeconds: number; durationSeconds: number; completed?: boolean }) =>
    ipcRenderer.invoke('library:position:save', p),
  positionGet: (contentId: string, episodeId?: string | null) => ipcRenderer.invoke('library:position:get', contentId, episodeId),
  positionList: () => ipcRenderer.invoke('library:position:list'),
  positionDelete: (contentId: string, episodeId?: string | null) => ipcRenderer.invoke('library:position:delete', contentId, episodeId),
  positionDeleteContent: (contentId: string) => ipcRenderer.invoke('library:position:delete-content', contentId),
  prefsGet: () => ipcRenderer.invoke('library:prefs:get'),
  prefsSet: (p: { language?: string; subtitleDefault?: string | null; autoplay?: boolean; maturityRating?: string; sourceDiscoveryMode?: 'progressive' | 'complete' }) =>
    ipcRenderer.invoke('library:prefs:set', p),
  exportLibraryFile: (input: { includeArtwork: boolean }) =>
    ipcRenderer.invoke('library:export-file', input),
  selectLibraryImport: () => ipcRenderer.invoke('library:import-select'),
  applyLibraryImport: (input: { token: string; mode: 'merge' | 'replace' }) =>
    ipcRenderer.invoke('library:import-apply', input),
  previewDiagnostics: () => ipcRenderer.invoke('diagnostics:preview'),
  saveDiagnostics: (input: { token: string }) => ipcRenderer.invoke('diagnostics:save', input),
  // ─── Providers (stream aggregator) ───────────────────────────────────────
  listProviders: () => ipcRenderer.invoke('providers:list'),
  toggleProvider: (id: string, enabled: boolean) => ipcRenderer.invoke('providers:toggle', id, enabled),
  getStream: (providerId: string, req: {
    imdbId?: string; tmdbId?: number; type: 'movie' | 'tv'; season?: number; episode?: number; title?: string; audioLang?: string
  }) => ipcRenderer.invoke('providers:getStream', providerId, req),
  getFirstStream: (req: {
    imdbId?: string; tmdbId?: number; type: 'movie' | 'tv'; season?: number; episode?: number; title?: string; audioLang?: string
  }, searchId?: string) => ipcRenderer.invoke('providers:getFirstStream', req, searchId),
  // Background-collected alternative sources for a getFirstStream call, correlated by
  // searchId. Fires after the caller has already received the first playable stream so
  // playback can start fast while the source-switcher fills in.
  onStreamsCollected: (
    callback: (payload: { searchId: string; allStreams: unknown[]; sourceStatuses?: unknown[] }) => void
  ) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      payload: { searchId: string; allStreams: unknown[]; sourceStatuses?: unknown[] }
    ) => callback(payload)
    ipcRenderer.on('providers:streamsCollected', handler)
    return () => ipcRenderer.removeListener('providers:streamsCollected', handler)
  },
  registerStreamHeaders: (streamUrl: string, headers: Record<string, string>) =>
    ipcRenderer.invoke('providers:registerStreamHeaders', streamUrl, headers),
  getProxyPort: () => ipcRenderer.invoke('providers:getProxyPort'),

  // ─── Built-in P2P torrent streaming (free dub sourcing, e.g. Spanish/Latino) ──
  // Discovery returns selectable sources whose URL is a magnet; the renderer resolves it to a
  // localhost, Chromium-playable MP4 URL on demand when the user actually picks the source.
  torrentGetStreams: (req: {
    imdbId?: string; tmdbId?: number; type: 'movie' | 'tv'; season?: number; episode?: number; title?: string
  }) => ipcRenderer.invoke('torrent:get-streams', req),
  torrentResolve: (magnet: string, audioLang?: string) => ipcRenderer.invoke('torrent:resolve', magnet, audioLang),
})
