import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { createHash } from 'crypto'
import { db } from '../db/connection.js'
import { accounts, refreshTokens } from '../db/schema.js'
import { verifyRefreshToken, signAccessToken, signRefreshToken, generateJti } from '../lib/jwt.js'
import { storeRefreshToken } from './shared.js'
import { getAccountPlan } from '../lib/plan.js'

const schema = z.object({
  refreshToken: z.string().min(1),
})

export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = schema.safeParse(request.body)
  if (!body.success) {
    return reply.code(422).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const unauthorized = () =>
    reply.code(401).send({
      success: false,
      error: { code: 'AUTH_TOKEN_INVALID', message: 'Invalid or expired refresh token' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })

  let payload: Awaited<ReturnType<typeof verifyRefreshToken>>
  try {
    payload = await verifyRefreshToken(body.data.refreshToken)
  } catch {
    return unauthorized()
  }

  const tokenHash = createHash('sha256').update(payload.jti).digest('hex')

  const storedToken = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt),
    ),
  })

  if (!storedToken) return unauthorized()

  if (storedToken.expiresAt < new Date()) {
    return unauthorized()
  }

  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, payload.sub), isNull(accounts.deletedAt)),
  })

  if (!account) return unauthorized()

  // Rotate: revoke old token
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, storedToken.id))

  // Issue new token pair
  const accessJti = generateJti()
  const refreshJti = generateJti()
  const plan = await getAccountPlan(account.id)

  const [accessToken, newRefreshToken] = await Promise.all([
    signAccessToken({ sub: account.id, email: account.email, plan, jti: accessJti }),
    signRefreshToken({ sub: account.id, jti: refreshJti }),
  ])

  await storeRefreshToken(account.id, refreshJti, storedToken.deviceSessionId ?? undefined)

  return reply.send({
    success: true,
    data: {
      accessToken,
      refreshToken: newRefreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + 900,
    },
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  })
}
