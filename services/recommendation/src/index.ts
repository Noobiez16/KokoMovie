import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { ensureTables, putExperiment } from './db/dynamo.js'
import { authenticate } from './lib/auth.js'
import { getHomeRowsHandler } from './handlers/home.js'
import { getSimilarHandler } from './handlers/similar.js'
import { getTrendingHandler } from './handlers/trending.js'

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
  path: string,
  handler: (req: Parameters<typeof authenticate>[0], rep: Parameters<typeof authenticate>[1]) => Promise<unknown>,
) {
  app.get(path, { config: { rateLimit: { max, timeWindow: '1 minute' } } }, async (req, rep) => {
    await withAuth(req as Parameters<typeof authenticate>[0], rep); if (rep.sent) return
    return handler(req as Parameters<typeof authenticate>[0], rep)
  })
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', async () => ({
  status: 'ok',
  service: 'recommendation',
  timestamp: new Date().toISOString(),
}))

// ─── Recommendation Routes ────────────────────────────────────────────────────

route(120, '/recommendations/home', getHomeRowsHandler)
route(120, '/recommendations/similar/:contentId', getSimilarHandler)
route(120, '/recommendations/trending', getTrendingHandler)

// ─── Startup ──────────────────────────────────────────────────────────────────

try {
  await ensureTables()
  app.log.info('DynamoDB tables ready')

  // Seed default A/B experiments on first run
  await putExperiment({
    experimentId: 'EXP-001',
    name: 'Recommendation row order',
    variants: [
      { id: 'control', weight: 80, description: 'Trending first' },
      { id: 'ml-first', weight: 20, description: 'ML recommendations first' },
    ],
    status: 'active',
    createdAt: new Date().toISOString(),
  })
  await putExperiment({
    experimentId: 'EXP-002',
    name: 'Autoplay delay',
    variants: [
      { id: '10s', weight: 34, description: '10 second autoplay' },
      { id: '5s', weight: 33, description: '5 second autoplay' },
      { id: '15s', weight: 33, description: '15 second autoplay' },
    ],
    status: 'active',
    createdAt: new Date().toISOString(),
  })
} catch (err) {
  app.log.warn({ err }, 'DynamoDB init warning — continuing')
}

try {
  await app.listen({ port: config.RECOMMENDATION_PORT, host: '0.0.0.0' })
  app.log.info(`Recommendation service listening on port ${config.RECOMMENDATION_PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
