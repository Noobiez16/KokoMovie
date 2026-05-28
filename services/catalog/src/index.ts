import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import crypto from 'crypto'
import { config } from './config.js'
import { authenticate } from './lib/auth.js'
import { browseHandler, getGenreRowsHandler, getTrendingHandler } from './handlers/browse.js'
import { searchHandler, semanticSearchHandler } from './handlers/search.js'
import { getContentHandler, ingestContentHandler, getGenresHandler, syncContentHandler } from './handlers/content.js'

const isDev = config.NODE_ENV !== 'production'

const app = Fastify({
  logger: isDev
    ? { level: 'debug', transport: { target: 'pino-pretty' } }
    : { level: 'info' },
  genReqId: () => crypto.randomUUID(),
})

await app.register(cors, { origin: isDev ? '*' : 'https://api.kokomovie.com' })
await app.register(helmet, { contentSecurityPolicy: false })
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

app.get('/health', async () => ({ status: 'ok', service: 'catalog', timestamp: new Date().toISOString() }))

app.get('/catalog/browse', { preHandler: authenticate }, browseHandler)
app.get('/catalog/browse/home', { preHandler: authenticate }, getGenreRowsHandler)
app.get('/catalog/trending', { preHandler: authenticate }, getTrendingHandler)
app.get('/catalog/genres', { preHandler: authenticate }, getGenresHandler)
app.get('/catalog/content/:id', { preHandler: authenticate }, getContentHandler)
app.get('/catalog/search', { preHandler: authenticate }, searchHandler)
app.get('/catalog/search/semantic', { preHandler: authenticate }, semanticSearchHandler)

// Sync a specific TMDB item into local DB (called when opening content detail for TMDB content)
app.post('/catalog/sync', { preHandler: authenticate }, syncContentHandler)

// Admin ingest (internal)
app.post('/catalog/ingest', ingestContentHandler)

try {
  await app.listen({ port: config.CATALOG_PORT, host: '0.0.0.0' })
  app.log.info(`catalog service listening on port ${config.CATALOG_PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
