import { app } from 'electron'
import type { BrowserWindow } from 'electron'

let certificatePolicyInstalled = false

export function setupCertPinning(_window: BrowserWindow) {
  if (certificatePolicyInstalled) return
  certificatePolicyInstalled = true
  // A certificate-error event means Chromium's normal CA/hostname/validity checks failed.
  // Never turn a failed platform trust decision into an accepted connection.
  app.on('certificate-error', (_event, _webContents, url, error, _certificate, callback) => {
    console.error(`[tls] Rejected invalid certificate for ${new URL(url).hostname}: ${error}`)
    callback(false)
  })
}
