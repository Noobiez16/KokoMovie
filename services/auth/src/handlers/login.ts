import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { accounts } from '../db/schema.js'
import { verifyPassword } from '../lib/password.js'
import { signAccessToken, signRefreshToken, generateJti } from '../lib/jwt.js'
import { storeRefreshToken, createDeviceSession } from './shared.js'
import { getClientIp, hashIp } from '../lib/ip.js'
import { getAccountPlan } from '../lib/plan.js'

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
  mfaToken: z.string().length(6).optional(),
  deviceName: z.string().max(100).optional(),
  platform: z.string().max(50).optional(),
})

export async function loginHandler(
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

  const { email, password, mfaToken, deviceName, platform } = body.data

  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.email, email), isNull(accounts.deletedAt)),
  })

  if (!account || !account.passwordHash) {
    // Constant-time response to prevent user enumeration
    await hashPassword_dummy()
    return reply.code(401).send({
      success: false,
      error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const passwordValid = await verifyPassword(password, account.passwordHash)
  if (!passwordValid) {
    return reply.code(401).send({
      success: false,
      error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  if (account.mfaEnabled) {
    if (!mfaToken) {
      return reply.code(401).send({
        success: false,
        error: { code: 'AUTH_MFA_REQUIRED', message: 'MFA token required' },
        meta: { requestId: request.id, timestamp: new Date().toISOString() },
      })
    }

    const { verifyToken } = await import('../lib/totp.js')
    if (!account.mfaSecret || !verifyToken(mfaToken, account.mfaSecret)) {
      return reply.code(401).send({
        success: false,
        error: { code: 'AUTH_MFA_INVALID', message: 'Invalid MFA token' },
        meta: { requestId: request.id, timestamp: new Date().toISOString() },
      })
    }
  }

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
    signAccessToken({ sub: account.id, email: account.email, plan, jti: accessJti }),
    signRefreshToken({ sub: account.id, jti: refreshJti }),
  ])

  await storeRefreshToken(account.id, refreshJti, sessionId)

  return reply.send({
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + 900,
      account: {
        id: account.id,
        email: account.email,
        plan,
        mfaEnabled: account.mfaEnabled,
        createdAt: account.createdAt.toISOString(),
      },
    },
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  })
}

// Prevents timing attacks when account doesn't exist
async function hashPassword_dummy() {
  const { hashPassword } = await import('../lib/password.js')
  await hashPassword('dummy_constant_string_for_timing')
}
