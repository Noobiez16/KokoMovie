import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { sql } from 'drizzle-orm'
import crypto from 'crypto'
import { config } from './config.js'
import { db } from './db/connection.js'
import { ensureTables } from './db/dynamo.js'
import { authenticate, type AuthenticatedRequest } from './lib/auth.js'
import {
  listProfilesHandler,
  createProfileHandler,
  updateProfileHandler,
  deleteProfileHandler,
} from './handlers/profiles.js'
import {
  getWatchlistHandler,
  addWatchlistHandler,
  removeWatchlistHandler,
  checkWatchlistHandler,
} from './handlers/watchlist.js'
import { getHistoryHandler, deleteHistoryHandler } from './handlers/history.js'
import { getPreferencesHandler, updatePreferencesHandler } from './handlers/preferences.js'
import { presignAvatarHandler, confirmAvatarHandler } from './handlers/avatar.js'
import { exportDataHandler } from './handlers/gdpr.js'

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: config.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
  },
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID(),
})

await app.register(cors, { origin: config.NODE_ENV !== 'production' ? '*' : 'https://api.kokomovie.com' })
await app.register(helmet, { contentSecurityPolicy: false })
await app.register(rateLimit, { global: false })

// ─── Helpers ─────────────────────────────────────────────────────────────────

const withAuth = async (
  request: Parameters<typeof authenticate>[0],
  reply: Parameters<typeof authenticate>[1],
) => { await authenticate(request, reply) }

function route(
  max: number,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  handler: (req: Parameters<typeof authenticate>[0], rep: Parameters<typeof authenticate>[1]) => Promise<unknown>,
) {
  app[method](path, { config: { rateLimit: { max, timeWindow: '1 minute' } } }, async (req, rep) => {
    await withAuth(req as Parameters<typeof authenticate>[0], rep); if (rep.sent) return
    return handler(req as Parameters<typeof authenticate>[0], rep)
  })
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', async () => {
  await db.execute(sql`SELECT 1`)
  return { status: 'ok', service: 'user', timestamp: new Date().toISOString() }
})

// ─── Profiles ─────────────────────────────────────────────────────────────────

route(60, 'get', '/user/profiles', listProfilesHandler)
route(20, 'post', '/user/profiles', createProfileHandler)
route(30, 'put', '/user/profiles/:id', updateProfileHandler)
route(10, 'delete', '/user/profiles/:id', deleteProfileHandler)

// ─── Watchlist ────────────────────────────────────────────────────────────────

route(120, 'get', '/user/watchlist', getWatchlistHandler)
route(60, 'post', '/user/watchlist/:contentId', addWatchlistHandler)
route(60, 'delete', '/user/watchlist/:contentId', removeWatchlistHandler)
route(120, 'get', '/user/watchlist/:contentId/check', checkWatchlistHandler)

// ─── Viewing History ──────────────────────────────────────────────────────────

route(60, 'get', '/user/history', getHistoryHandler)
route(60, 'delete', '/user/history', deleteHistoryHandler)

// ─── Preferences ──────────────────────────────────────────────────────────────

route(60, 'get', '/user/preferences', getPreferencesHandler)
route(30, 'put', '/user/preferences', updatePreferencesHandler)

// ─── Avatar ───────────────────────────────────────────────────────────────────

route(10, 'post', '/user/avatar/presign', presignAvatarHandler)
route(10, 'put', '/user/avatar/confirm', confirmAvatarHandler)

// ─── GDPR ─────────────────────────────────────────────────────────────────────

route(2, 'get', '/user/export', exportDataHandler)

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  await ensureTables()
  app.log.info('DynamoDB tables ready')
} catch (err) {
  app.log.warn({ err }, 'DynamoDB table init warning — continuing')
}

try {
  await app.listen({ port: config.USER_PORT, host: '0.0.0.0' })
  app.log.info(`User service listening on port ${config.USER_PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
