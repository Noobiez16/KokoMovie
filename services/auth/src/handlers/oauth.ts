import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { eq, isNull, and } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db } from '../db/connection.js'
import { accounts } from '../db/schema.js'
import { signAccessToken, signRefreshToken, generateJti } from '../lib/jwt.js'
import { storeRefreshToken, createDeviceSession } from './shared.js'
import { redis, keys } from '../redis/client.js'
import { getClientIp, hashIp } from '../lib/ip.js'
import { config } from '../config.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

// ─── Google OAuth ────────────────────────────────────────────────────────────

export async function googleInitHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_REDIRECT_URI) {
    return reply.code(501).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Google OAuth not configured' }, meta: meta(request) })
  }

  const state = randomBytes(16).toString('hex')
  await redis.setex(keys.oauthState(state), 600, 'google') // 10min TTL

  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: config.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  })

  return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

const googleCallbackSchema = z.object({
  code: z.string(),
  state: z.string(),
})

export async function googleCallbackHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = googleCallbackSchema.safeParse(request.query)
  if (!query.success) {
    return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid OAuth callback' }, meta: meta(request) })
  }

  const stateValid = await redis.get(keys.oauthState(query.data.state))
  if (!stateValid) {
    return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid OAuth state' }, meta: meta(request) })
  }
  await redis.del(keys.oauthState(query.data.state))

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: query.data.code,
      client_id: config.GOOGLE_CLIENT_ID!,
      client_secret: config.GOOGLE_CLIENT_SECRET!,
      redirect_uri: config.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return reply.code(502).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Google token exchange failed' }, meta: meta(request) })
  }

  const tokenData = await tokenRes.json() as { id_token: string }
  const idToken = tokenData.id_token

  // Decode ID token (verify in production with Google's public keys)
  const [, payloadB64] = idToken.split('.')
  if (!payloadB64) return reply.code(502).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Invalid Google ID token' }, meta: meta(request) })

  const googleUser = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { sub: string; email: string }

  return issueTokensForOAuthUser(request, reply, { oauthId: googleUser.sub, email: googleUser.email, provider: 'google' })
}

// ─── Shared OAuth user resolution ────────────────────────────────────────────

async function issueTokensForOAuthUser(
  request: FastifyRequest,
  reply: FastifyReply,
  opts: { oauthId: string; email: string; provider: 'google' | 'apple' },
) {
  const field = opts.provider === 'google' ? accounts.googleId : accounts.appleId

  let account = await db.query.accounts.findFirst({
    where: and(eq(field, opts.oauthId), isNull(accounts.deletedAt)),
  })

  if (!account) {
    // Try to link to existing email account
    const byEmail = await db.query.accounts.findFirst({
      where: and(eq(accounts.email, opts.email), isNull(accounts.deletedAt)),
    })

    if (byEmail) {
      const update = opts.provider === 'google' ? { googleId: opts.oauthId } : { appleId: opts.oauthId }
      ;[account] = await db.update(accounts).set(update).where(eq(accounts.id, byEmail.id)).returning()
    } else {
      const insert = opts.provider === 'google'
        ? { email: opts.email, googleId: opts.oauthId }
        : { email: opts.email, appleId: opts.oauthId }
      ;[account] = await db.insert(accounts).values(insert).returning()
    }
  }

  if (!account) throw new Error('Failed to resolve OAuth account')

  const accessJti = generateJti()
  const refreshJti = generateJti()
  const ip = getClientIp({ ip: request.ip, headers: request.headers as Record<string, string | undefined> })

  const sessionId = await createDeviceSession(account.id, {
    deviceName: `${opts.provider} Sign-In`,
    platform: 'oauth',
    ipAddressHash: hashIp(ip),
    userAgent: request.headers['user-agent'],
  })

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ sub: account.id, email: account.email, plan: 'none', jti: accessJti }),
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
        plan: 'none',
        mfaEnabled: account.mfaEnabled,
        createdAt: account.createdAt.toISOString(),
      },
    },
    meta: meta(request),
  })
}
