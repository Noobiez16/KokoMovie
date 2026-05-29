import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import crypto from 'crypto'
import { config } from './config.js'
import { authenticate } from './lib/auth.js'
import { ensureTables } from './db/dynamo.js'
import { disconnectProducer } from './kafka/producer.js'
import { createSessionHandler, getSessionHandler } from './handlers/session.js'
import { heartbeatHandler, getPositionHandler, getContinueWatchingHandler, deletePositionHandler } from './handlers/position.js'
import { drmLicenseHandler } from './handlers/drm.js'
import { qualityReportHandler } from './handlers/quality.js'

const isDev = config.NODE_ENV !== 'production'

const app = Fastify({
  logger: isDev
    ? { level: 'debug', transport: { target: 'pino-pretty' } }
    : { level: 'info' },
  genReqId: () => crypto.randomUUID(),
})

await app.register(cors, { origin: isDev ? '*' : 'https://api.kokomovie.com' })
await app.register(helmet, { contentSecurityPolicy: false })
await app.register(rateLimit, { max: 600, timeWindow: '1 minute' })

app.get('/health', async () => ({
  status: 'ok',
  service: 'playback',
  timestamp: new Date().toISOString(),
}))

// Playback session
app.post('/playback/session', { preHandler: authenticate }, createSessionHandler)
app.get('/playback/session/:sessionId', { preHandler: authenticate }, getSessionHandler)

// Position heartbeat
app.put('/playback/position', { preHandler: authenticate }, heartbeatHandler)
app.get('/playback/position/:contentId', { preHandler: authenticate }, getPositionHandler)
app.delete('/playback/position/:contentId', { preHandler: authenticate }, deletePositionHandler)
app.get('/playback/continue-watching', { preHandler: authenticate }, getContinueWatchingHandler)

// DRM
app.get('/playback/drm/license', { preHandler: authenticate }, drmLicenseHandler)

// Quality telemetry
app.post('/playback/quality-report', { preHandler: authenticate }, qualityReportHandler)

app.addHook('onClose', async () => {
  await disconnectProducer()
})

try {
  await ensureTables()
  app.log.info('DynamoDB tables ready')
} catch (err) {
  app.log.warn({ err }, 'DynamoDB table setup failed (service may not be ready yet)')
}

try {
  await app.listen({ port: config.PLAYBACK_PORT, host: '0.0.0.0' })
  app.log.info(`playback service listening on port ${config.PLAYBACK_PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
