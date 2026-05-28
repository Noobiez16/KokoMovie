import { contextBridge, ipcRenderer } from 'electron'

// E1-S2: Expose ONLY whitelisted APIs via contextBridge — no direct Node.js access
contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Auth / Keychain ──────────────────────────────────────────────────────
  getAuthToken: () => ipcRenderer.invoke('keychain:get-token'),
  setAuthToken: (token: string) => ipcRenderer.invoke('keychain:set-token', token),
  clearAuthToken: () => ipcRenderer.invoke('keychain:clear-token'),
  getRefreshToken: () => ipcRenderer.invoke('keychain:get-refresh-token'),
  setRefreshToken: (token: string, persist?: boolean) => ipcRenderer.invoke('keychain:set-refresh-token', token, persist ?? true),
  getTmdbApiKey: (accountId: string) => ipcRenderer.invoke('keychain:get-tmdb-key', accountId),
  setTmdbApiKey: (accountId: string, key: string) => ipcRenderer.invoke('keychain:set-tmdb-key', accountId, key),
  clearTmdbApiKey: (accountId: string) => ipcRenderer.invoke('keychain:clear-tmdb-key', accountId),

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
  }) => ipcRenderer.invoke('download:start', opts),
  cancelDownload: (id: string) => ipcRenderer.invoke('download:cancel', id),
  deleteDownload: (id: string) => ipcRenderer.invoke('download:delete', id),
  listDownloads: () => ipcRenderer.invoke('download:list'),
  getOfflineManifest: (id: string) => ipcRenderer.invoke('download:get-manifest', id),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  getDefaultDownloadsDir: () => ipcRenderer.invoke('download:get-default-dir'),
  onDownloadProgress: (
    callback: (progress: {
      id: string
      percent: number
      status?: string
      completedSegments?: number
      totalSegments?: number
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
        errorMessage?: string
      }
    ) => callback(progress)
    ipcRenderer.on('download:progress', handler)
    return () => ipcRenderer.removeListener('download:progress', handler)
  },

  // ─── App ──────────────────────────────────────────────────────────────────
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  onUpdateAvailable: (callback: () => void) => {
    ipcRenderer.on('update:available', callback)
    return () => ipcRenderer.removeListener('update:available', callback)
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on('update:downloaded', callback)
    return () => ipcRenderer.removeListener('update:downloaded', callback)
  },
  installUpdate: () => ipcRenderer.invoke('app:install-update'),

  // ─── Deep-link OAuth callback ─────────────────────────────────────────────
  onOAuthCallback: (callback: (url: string) => void) => {
    ipcRenderer.on('oauth:callback', (_: Electron.IpcRendererEvent, url: string) => callback(url))
    return () => ipcRenderer.removeAllListeners('oauth:callback')
  },

  // ─── API proxy (bypasses file:// CORS restrictions) ─────────────────────
  apiRequest: (opts: { url: string; method: string; headers: Record<string, string>; body?: string }) =>
    ipcRenderer.invoke('api:request', opts),

  // ─── Providers (stream aggregator) ───────────────────────────────────────
  listProviders: () => ipcRenderer.invoke('providers:list'),
  toggleProvider: (id: string, enabled: boolean) => ipcRenderer.invoke('providers:toggle', id, enabled),
  getStream: (providerId: string, req: {
    imdbId?: string; tmdbId?: number; type: 'movie' | 'tv'; season?: number; episode?: number; title?: string
  }) => ipcRenderer.invoke('providers:getStream', providerId, req),
  getFirstStream: (req: {
    imdbId?: string; tmdbId?: number; type: 'movie' | 'tv'; season?: number; episode?: number; title?: string
  }) => ipcRenderer.invoke('providers:getFirstStream', req),
  registerStreamHeaders: (streamUrl: string, headers: Record<string, string>) =>
    ipcRenderer.invoke('providers:registerStreamHeaders', streamUrl, headers),
})
