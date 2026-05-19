import type { FastifyRequest, FastifyReply } from 'fastify'
import { importSPKI, jwtVerify, type KeyLike } from 'jose'
import { config } from '../config.js'

let cachedPublicKey: KeyLike | null = null

async function getPublicKey(): Promise<KeyLike> {
  if (cachedPublicKey) return cachedPublicKey

  const res = await fetch(`${config.AUTH_SERVICE_URL}/auth/public-key`)
  if (!res.ok) throw new Error('Failed to fetch public key from Auth service')
  const { publicKey: pem } = await res.json() as { publicKey: string }

  cachedPublicKey = await importSPKI(pem, 'RS256')
  return cachedPublicKey
}

export interface AuthenticatedRequest extends FastifyRequest {
  accountId: string
  profileId: string | null
  jwtPlan: string
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({
      success: false,
      error: { code: 'AUTH_TOKEN_INVALID', message: 'Missing Authorization header' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const token = header.slice(7)

  try {
    const publicKey = await getPublicKey()
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: 'kokomovie-auth',
      audience: 'kokomovie-api',
    })

    const req = request as unknown as AuthenticatedRequest
    req.accountId = payload.sub as string
    req.profileId = (request.headers['x-profile-id'] as string | undefined) ?? null
    req.jwtPlan = (payload as { plan: string }).plan
  } catch {
    return reply.code(401).send({
      success: false,
      error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired or invalid' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }
}
