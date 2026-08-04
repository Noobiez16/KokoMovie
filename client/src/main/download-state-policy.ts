export const DOWNLOAD_STATUSES = [
  'pending', 'downloading', 'paused', 'completed', 'cancelled', 'error',
] as const

export type DownloadStatus = typeof DOWNLOAD_STATUSES[number]

const ALLOWED_TRANSITIONS: Readonly<Record<DownloadStatus, readonly DownloadStatus[]>> = {
  pending: ['downloading', 'cancelled', 'error'],
  downloading: ['pending', 'paused', 'completed', 'cancelled', 'error'],
  paused: ['pending', 'cancelled', 'error'],
  completed: [],
  cancelled: [],
  error: ['pending', 'cancelled'],
}

export function canTransitionDownload(from: DownloadStatus, to: DownloadStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to)
}

export function recoverInterruptedStatus(status: DownloadStatus): DownloadStatus {
  return status === 'downloading' ? 'pending' : status
}

export function contiguousRecoverablePrefix(
  segmentSizes: ReadonlyMap<number, number>,
  maximumSegments: number,
  encryptionOverhead = 28,
): { completed: number; encryptedBytes: number } {
  let completed = 0
  let encryptedBytes = 0
  while (completed < maximumSegments) {
    const size = segmentSizes.get(completed)
    if (size === undefined || size <= encryptionOverhead) break
    encryptedBytes += size
    completed++
  }
  return { completed, encryptedBytes }
}
