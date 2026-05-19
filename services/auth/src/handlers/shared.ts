import { createHash } from 'crypto'
import { db } from '../db/connection.js'
import { refreshTokens, deviceSessions } from '../db/schema.js'
import { config } from '../config.js'

export async function storeRefreshToken(
  accountId: string,
  jti: string,
  deviceSessionId?: string,
): Promise<void> {
  const tokenHash = createHash('sha256').update(jti).digest('hex')
  const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL * 1000)

  await db.insert(refreshTokens).values({
    accountId,
    tokenHash,
    deviceSessionId: deviceSessionId ?? null,
    expiresAt,
  })
}

export async function createDeviceSession(
  accountId: string,
  opts: { deviceName: string; platform: string; ipAddressHash: string; userAgent?: string },
): Promise<string> {
  const [session] = await db
    .insert(deviceSessions)
    .values({
      accountId,
      deviceName: opts.deviceName,
      platform: opts.platform,
      ipAddressHash: opts.ipAddressHash,
      userAgent: opts.userAgent ?? null,
    })
    .returning({ id: deviceSessions.id })

  if (!session) throw new Error('Failed to create device session')
  return session.id
}

export function buildSuccessResponse<T>(
  data: T,
  requestId: string,
): { success: true; data: T; meta: { requestId: string; timestamp: string } } {
  return { success: true, data, meta: { requestId, timestamp: new Date().toISOString() } }
}
