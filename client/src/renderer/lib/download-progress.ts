import type { DownloadItem } from '../api/downloads'

export interface DownloadProgressUpdate {
  id: string
  percent: number
  status?: string
  completedSegments?: number
  totalSegments?: number
  downloadedBytes?: number
  totalBytes?: number
}

export function applyDownloadProgress(items: DownloadItem[], update: DownloadProgressUpdate): DownloadItem[] {
  if (update.status === 'cancelled') return items.filter((item) => item.id !== update.id)
  return items.map((item) => item.id === update.id ? {
    ...item,
    progress_percent: Math.max(0, Math.min(100, update.percent)),
    status: (update.status || (update.percent >= 100 ? 'completed' : 'downloading')) as DownloadItem['status'],
    completed_segments: update.completedSegments ?? item.completed_segments,
    total_segments: update.totalSegments ?? item.total_segments,
    downloaded_bytes: update.downloadedBytes ?? item.downloaded_bytes,
    total_bytes: update.totalBytes ?? item.total_bytes,
  } : item)
}
