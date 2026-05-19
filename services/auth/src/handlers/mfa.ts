import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { accounts } from '../db/schema.js'
import { generateSecret, generateBackupCodes, generateQrCodeUrl, verifyToken } from '../lib/totp.js'
import { redis, keys } from '../redis/client.js'

const MFA_THROTTLE_WINDOW = 300 // 5 minutes
const MFA_MAX_ATTEMPTS = 5

const verifySchema = z.object({
  token: z.string().length(6).regex(/^\d{6}$/),
})

export async function mfaSetupHandler(
  request: FastifyRequest & { accountId: string },
  reply: FastifyReply,
) {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, request.accountId),
  })
  if (!account) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Account not found' }, meta: meta(request) })

  const secret = generateSecret()
  const backupCodes = generateBackupCodes()
  const qrCodeUrl = await generateQrCodeUrl(account.email, secret)

  // Store secret temporarily (not yet enabled) — confirm via /mfa/verify
  await db.update(accounts).set({ mfaSecret: secret, mfaBackupCodes: backupCodes }).where(eq(accounts.id, account.id))

  return reply.send({
    success: true,
    data: { secret, qrCodeUrl, backupCodes },
    meta: meta(request),
  })
}

export async function mfaVerifyHandler(
  request: FastifyRequest & { accountId: string },
  reply: FastifyReply,
) {
  const body = verifySchema.safeParse(request.body)
  if (!body.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid token format' }, meta: meta(request) })
  }

  // Throttle brute force
  const throttleKey = keys.mfaThrottle(request.accountId)
  const attempts = await redis.incr(throttleKey)
  if (attempts === 1) await redis.expire(throttleKey, MFA_THROTTLE_WINDOW)
  if (attempts > MFA_MAX_ATTEMPTS) {
    return reply.code(429).send({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many MFA attempts. Try again later.' }, meta: meta(request) })
  }

  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, request.accountId) })
  if (!account?.mfaSecret) {
    return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'MFA setup not started' }, meta: meta(request) })
  }

  if (!verifyToken(body.data.token, account.mfaSecret)) {
    return reply.code(401).send({ success: false, error: { code: 'AUTH_MFA_INVALID', message: 'Invalid MFA token' }, meta: meta(request) })
  }

  await db.update(accounts).set({ mfaEnabled: true }).where(eq(accounts.id, account.id))
  await redis.del(throttleKey)

  return reply.send({
    success: true,
    data: { mfaEnabled: true },
    meta: meta(request),
  })
}

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}
