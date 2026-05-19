import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { createHash } from 'crypto'
import { eq, isNull } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { refreshTokens } from '../db/schema.js'
import { verifyRefreshToken } from '../lib/jwt.js'
import { redis, keys } from '../redis/client.js'
import { config } from '../config.js'

const schema = z.object({
  refreshToken: z.string().min(1),
})

export async function logoutHandler(
  request: FastifyRequest & { jwtPayload?: { jti: string; exp: number } },
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

  // Add access token to denylist if we have it
  if (request.jwtPayload?.jti) {
    const ttl = Math.max(0, (request.jwtPayload.exp ?? 0) - Math.floor(Date.now() / 1000))
    if (ttl > 0) {
      await redis.setex(keys.accessTokenDenylist(request.jwtPayload.jti), ttl, '1')
    }
  }

  // Revoke refresh token
  try {
    const payload = await verifyRefreshToken(body.data.refreshToken)
    const tokenHash = createHash('sha256').update(payload.jti).digest('hex')
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash))
  } catch {
    // Still return success — token was already invalid
  }

  return reply.send({
    success: true,
    data: null,
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  })
}
