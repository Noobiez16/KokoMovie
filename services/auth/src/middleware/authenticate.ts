import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyAccessToken } from '../lib/jwt.js'
import { redis, keys } from '../redis/client.js'

export interface AuthenticatedRequest extends FastifyRequest {
  accountId: string
  jwtPayload: { sub: string; email: string; plan: string; jti: string; exp: number }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({
      success: false,
      error: { code: 'AUTH_TOKEN_INVALID', message: 'Missing or malformed Authorization header' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const token = header.slice(7)
  let payload: Awaited<ReturnType<typeof verifyAccessToken>>

  try {
    payload = await verifyAccessToken(token)
  } catch {
    return reply.code(401).send({
      success: false,
      error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Access token expired or invalid' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  // Check denylist
  const denied = await redis.get(keys.accessTokenDenylist(payload.jti))
  if (denied) {
    return reply.code(401).send({
      success: false,
      error: { code: 'AUTH_TOKEN_INVALID', message: 'Token has been revoked' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const req = request as AuthenticatedRequest
  req.accountId = payload.sub
  req.jwtPayload = {
    sub: payload.sub,
    email: payload.email,
    plan: payload.plan,
    jti: payload.jti,
    exp: payload.exp as number,
  }
}
