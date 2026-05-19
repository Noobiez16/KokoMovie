import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { cacheGet, cacheSet } from '../lib/redis.js'
import { getTrendingItems } from '../lib/personalize.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

export async function getTrendingHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = z.object({ segment: z.string().optional() }).safeParse(request.query)
  const segment = query.success ? (query.data.segment ?? 'all') : 'all'

  const cacheKey = `rec:trending:${segment}`
  const cached = await cacheGet<object[]>(cacheKey)
  if (cached) return reply.send({ success: true, data: cached, meta: { ...meta(request), cached: true } })

  const items = await getTrendingItems(20)
  await cacheSet(cacheKey, items, 120)

  return reply.send({ success: true, data: items, meta: meta(request) })
}
