import { app } from 'electron'
import type { BrowserWindow } from 'electron'

const API_DOMAIN = 'api.kokomovie.com'
const EXPECTED_FINGERPRINT = process.env['API_CERT_FINGERPRINT'] ?? ''
const isDev = !app.isPackaged || process.env['NODE_ENV'] === 'development'

export function setupCertPinning(_window: BrowserWindow) {
  app.on('certificate-error', (event, _webContents, url, _error, certificate, callback) => {
    const isApiDomain = url.startsWith(`https://${API_DOMAIN}`)

    if (isApiDomain) {
      if (!isDev && EXPECTED_FINGERPRINT) {
        if (certificate.fingerprint === EXPECTED_FINGERPRINT) {
          event.preventDefault()
          callback(true)
        } else {
          // Potential MITM on production API — reject and log
          console.error(`[cert-pinning] Certificate mismatch for ${url}. Expected: ${EXPECTED_FINGERPRINT}, Got: ${certificate.fingerprint}`)
          callback(false)
        }
      } else {
        // In dev, allow API cert errors (localhost, etc.)
        event.preventDefault()
        callback(true)
      }
    } else {
      // For any other domain (e.g. streaming providers, TMDB images, stream segments):
      // Bypass certificate errors to ensure content loads successfully.
      event.preventDefault()
      callback(true)
    }
  })
}
