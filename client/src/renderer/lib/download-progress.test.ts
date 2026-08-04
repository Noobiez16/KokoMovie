import { describe, expect, it } from 'vitest'
import { applyDownloadProgress } from './download-progress'
import type { DownloadItem } from '../api/downloads'

const item = {
  id: 'one', content_id: 'content', episode_id: null, title: 'Movie', content_type: 'movie',
  thumbnail_url: null, duration_mins: 90, status: 'pending', progress_percent: 0,
  download_speed_kbps: 0, total_segments: 10, completed_segments: 0,
  downloaded_bytes: 0, total_bytes: 1000, manifest_path: null, downloaded_at: null,
  expires_at: '2099-01-01T00:00:00.000Z', error_message: null,
} satisfies DownloadItem

describe('download progress reconciliation', () => {
  it('updates bytes, segments, status, and bounded percentage', () => {
    expect(applyDownloadProgress([item], {
      id: 'one', percent: 120, completedSegments: 10, totalSegments: 10,
      downloadedBytes: 1000, totalBytes: 1000,
    })[0]).toMatchObject({
      progress_percent: 100, status: 'completed', completed_segments: 10,
      total_segments: 10, downloaded_bytes: 1000, total_bytes: 1000,
    })
  })

  it('removes cancelled rows and leaves unrelated rows unchanged', () => {
    expect(applyDownloadProgress([item], { id: 'one', percent: 0, status: 'cancelled' })).toEqual([])
    expect(applyDownloadProgress([item], { id: 'other', percent: 50 })[0]).toBe(item)
  })
})
