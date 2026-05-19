import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { randomBytes } from 'crypto'

authenticator.options = { window: 1 }

export function generateSecret(): string {
  return authenticator.generateSecret(32)
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString('hex').toUpperCase(),
  )
}

export async function generateQrCodeUrl(
  email: string,
  secret: string,
): Promise<string> {
  const otpAuthUrl = authenticator.keyuri(email, 'KokoMovie', secret)
  return QRCode.toDataURL(otpAuthUrl)
}

export function verifyToken(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret })
}
