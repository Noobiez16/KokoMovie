import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { accounts } from '../db/schema.js'
import { hashPassword } from '../lib/password.js'
import { signAccessToken, signRefreshToken, generateJti } from '../lib/jwt.js'
import { storeRefreshToken, createDeviceSession } from './shared.js'
import { getClientIp, hashIp } from '../lib/ip.js'
import { getAccountPlan } from '../lib/plan.js'
import { createTrialSubscription } from '../lib/billing.js'

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  deviceName: z.string().max(100).optional(),
  platform: z.string().max(50).optional(),
})

export async function registerHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = schema.safeParse(request.body)
  if (!body.success) {
    return reply.code(422).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten().fieldErrors },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const { email, password, deviceName, platform } = body.data

  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.email, email),
  })

  if (existing) {
    return reply.code(409).send({
      success: false,
      error: { code: 'AUTH_EMAIL_TAKEN', message: 'Email already registered' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const passwordHash = await hashPassword(password)
  const [account] = await db
    .insert(accounts)
    .values({ email, passwordHash })
    .returning()

  if (!account) throw new Error('Failed to create account')

  // Provision 14-day trial in billing schema (non-fatal if billing not migrated yet)
  await createTrialSubscription(account.id).catch(() => {})

  const accessJti = generateJti()
  const refreshJti = generateJti()

  const ip = getClientIp({ ip: request.ip, headers: request.headers as Record<string, string | undefined> })
  const sessionId = await createDeviceSession(account.id, {
    deviceName: deviceName ?? 'Unknown Device',
    platform: platform ?? 'unknown',
    ipAddressHash: hashIp(ip),
    userAgent: request.headers['user-agent'],
  })

  const plan = await getAccountPlan(account.id)

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ sub: account.id, email, plan, jti: accessJti }),
    signRefreshToken({ sub: account.id, jti: refreshJti }),
  ])

  await storeRefreshToken(account.id, refreshJti, sessionId)

  return reply.code(201).send({
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + 900,
      account: {
        id: account.id,
        email: account.email,
        plan,
        mfaEnabled: false,
        createdAt: account.createdAt.toISOString(),
      },
    },
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  })
}
