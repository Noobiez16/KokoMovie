import { describe, expect, it } from 'vitest'
import { downloadErrorTranslationKey } from './download-error-policy'

describe('download error localization policy', () => {
  it('maps public HLS failure codes to localized copy', () => {
    expect(downloadErrorTranslationKey(new Error('Error invoking remote method: DOWNLOAD_UNSUPPORTED_DRM')))
      .toBe('downloads.unsupportedDrm')
    expect(downloadErrorTranslationKey('DOWNLOAD_UNSUPPORTED_PLAYLIST'))
      .toBe('downloads.unsupportedPlaylist')
  })

  it('uses a safe generic message for internal errors', () => {
    expect(downloadErrorTranslationKey(new Error('credential secret-value failed')))
      .toBe('downloads.startFailed')
  })
})
