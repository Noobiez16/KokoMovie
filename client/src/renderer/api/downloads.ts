export interface DownloadItem {
  id: string
  content_id: string
  episode_id: string | null
  title: string
  content_type: string
  thumbnail_url: string | null
  duration_mins: number | null
  status: 'pending' | 'downloading' | 'completed' | 'cancelled' | 'error'
  progress_percent: number
  download_speed_kbps: number
  total_segments: number
  completed_segments: number
  manifest_path: string | null
  downloaded_at: string | null
  expires_at: string
  error_message: string | null
}

export interface StartDownloadOpts {
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
}

export const downloadsApi = {
  start: (opts: StartDownloadOpts) =>
    window.electronAPI!.downloadContent(opts) as Promise<{ id: string; expiresAt: string }>,

  cancel: (id: string) =>
    window.electronAPI!.cancelDownload(id) as Promise<boolean>,

  delete: (id: string) =>
    window.electronAPI!.deleteDownload(id) as Promise<boolean>,

  list: () =>
    window.electronAPI!.listDownloads() as Promise<DownloadItem[]>,

  getManifest: (id: string) =>
    window.electronAPI!.getOfflineManifest(id) as Promise<{ manifestContent: string; drmKeyId: string | null } | null>,
}
