export type DownloadErrorTranslationKey =
  | 'downloads.unsupportedDrm'
  | 'downloads.unsupportedPlaylist'
  | 'downloads.startFailed'

export function downloadErrorTranslationKey(error: unknown): DownloadErrorTranslationKey {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('DOWNLOAD_UNSUPPORTED_DRM')) return 'downloads.unsupportedDrm'
  if (message.includes('DOWNLOAD_UNSUPPORTED_PLAYLIST')) return 'downloads.unsupportedPlaylist'
  return 'downloads.startFailed'
}
