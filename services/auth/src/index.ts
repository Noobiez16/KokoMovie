import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import crypto from 'crypto'
import { config } from './config.js'
import { db } from './db/connection.js'
import { redis } from './redis/client.js'
import { registerHandler } from './handlers/register.js'
import { loginHandler } from './handlers/login.js'
import { refreshHandler } from './handlers/refresh.js'
import { logoutHandler } from './handlers/logout.js'
import { mfaSetupHandler, mfaVerifyHandler } from './handlers/mfa.js'
import { listDevicesHandler, revokeDeviceHandler } from './handlers/devices.js'
import { googleInitHandler, googleCallbackHandler } from './handlers/oauth.js'
import { authenticate, type AuthenticatedRequest } from './middleware/authenticate.js'
import { getPublicKeyPem } from './lib/jwt.js'
import { sql } from 'drizzle-orm'

const app = Fastify({
  logger: config.NODE_ENV !== 'production'
    ? { level: 'debug', transport: { target: 'pino-pretty' } }
    : { level: 'info' },
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID(),
})

// ─── Plugins ─────────────────────────────────────────────────────────────────

await app.register(cors, {
  origin: config.NODE_ENV === 'production' ? 'https://api.kokomovie.com' : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
})

await app.register(helmet, {
  contentSecurityPolicy: false,
})

await app.register(rateLimit, {
  global: false,
})

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', async () => {
  await db.execute(sql`SELECT 1`)
  await redis.ping()
  return { status: 'ok', service: 'auth', timestamp: new Date().toISOString() }
})

// ─── Public key endpoint (services use this to verify JWTs locally) ──────────

app.get('/auth/public-key', async () => {
  return { publicKey: getPublicKeyPem() }
})

// ─── Public routes ────────────────────────────────────────────────────────────

app.post('/auth/register', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, registerHandler)

app.post('/auth/login', {
  config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
}, loginHandler)

app.post('/auth/refresh', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
}, refreshHandler)

app.post('/auth/logout', async (request, reply) => {
  await authenticate(request, reply)
  if (reply.sent) return
  return logoutHandler(request as unknown as AuthenticatedRequest, reply)
})

// ─── OAuth routes ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.get('/auth/oauth/google', googleInitHandler as any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.get('/auth/oauth/google/callback', googleCallbackHandler as any)

// ─── Authenticated routes ─────────────────────────────────────────────────────

app.post('/auth/mfa/setup', async (request, reply) => {
  await authenticate(request, reply)
  if (reply.sent) return
  return mfaSetupHandler(request as unknown as AuthenticatedRequest, reply)
})

app.post('/auth/mfa/verify', async (request, reply) => {
  await authenticate(request, reply)
  if (reply.sent) return
  return mfaVerifyHandler(request as unknown as AuthenticatedRequest, reply)
})

app.get('/auth/devices', async (request, reply) => {
  await authenticate(request, reply)
  if (reply.sent) return
  return listDevicesHandler(request as unknown as AuthenticatedRequest, reply)
})

app.delete('/auth/devices/:id', async (request, reply) => {
  await authenticate(request, reply)
  if (reply.sent) return
  return revokeDeviceHandler(request as unknown as AuthenticatedRequest, reply)
})

// ─── Start ────────────────────────────────────────────────────────────────────

await redis.connect()

try {
  await app.listen({ port: config.AUTH_PORT, host: '0.0.0.0' })
  app.log.info(`Auth service listening on port ${config.AUTH_PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
