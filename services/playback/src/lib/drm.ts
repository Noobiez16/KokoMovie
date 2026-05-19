import { config } from '../config.js'

export interface DrmLicenseResult {
  license: string // base64-encoded license blob
}

// In dev: bypass DRM and return a mock license.
// In prod: forward the EME challenge to the Widevine license server.
export async function acquireWidevineLicense(
  challenge: Buffer,
  contentId: string,
  drmKeyId: string | null
): Promise<DrmLicenseResult> {
  if (config.NODE_ENV !== 'production' || !drmKeyId) {
    // Dev bypass: return mock license
    return { license: Buffer.from('mock-license-dev').toString('base64') }
  }

  // Production: forward challenge to license server
  // Replace with actual Widevine license server URL (Google or Axinom)
  const licenseServerUrl = process.env['WIDEVINE_LICENSE_SERVER_URL'] ?? ''
  if (!licenseServerUrl) throw new Error('WIDEVINE_LICENSE_SERVER_URL not configured')

  const response = await fetch(licenseServerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-goog-api-key': process.env['WIDEVINE_API_KEY'] ?? '',
    },
    body: challenge,
  })

  if (!response.ok) {
    throw new Error(`License server returned ${response.status}`)
  }

  const licenseBuffer = await response.arrayBuffer()
  return { license: Buffer.from(licenseBuffer).toString('base64') }
}

export function detectDrmLevel(): 'L1' | 'L3' | 'none' {
  // Level detection happens on the client side via EME requestMediaKeySystemAccess.
  // The service only proxies licenses — level is reported by the client.
  return 'L3'
}
