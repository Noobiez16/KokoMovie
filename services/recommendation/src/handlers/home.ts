import type { FastifyRequest, FastifyReply } from 'fastify'
import { cacheGet, cacheSet } from '../lib/redis.js'
import { getPersonalizedItems, getTrendingItems } from '../lib/personalize.js'
import { getActiveExperiments, assignVariant } from '../db/dynamo.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

const CACHE_TTL = 120 // 2 minutes per architecture

export async function getHomeRowsHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  const profileId = req.profileId ?? req.accountId

  // A/B: row order experiment
  const experiments = await getActiveExperiments().catch(() => [])
  const rowOrderExp = experiments.find((e) => e.experimentId === 'EXP-001')
  const variant = rowOrderExp
    ? assignVariant(profileId, 'EXP-001', rowOrderExp.variants)
    : 'control'

  const cacheKey = `rec:home:${profileId}:${variant}`
  const cached = await cacheGet<object>(cacheKey)
  if (cached) return reply.send({ success: true, data: cached, meta: { ...meta(request), cached: true } })

  const [personalized, trending] = await Promise.all([
    getPersonalizedItems(profileId, 20),
    getTrendingItems(20),
  ])

  const rows =
    variant === 'ml-first'
      ? [
          { id: 'recommended', title: 'Recommended for You', items: personalized },
          { id: 'trending', title: 'Trending Now', items: trending },
        ]
      : [
          { id: 'trending', title: 'Trending Now', items: trending },
          { id: 'recommended', title: 'Recommended for You', items: personalized },
        ]

  await cacheSet(cacheKey, rows, CACHE_TTL)
  return reply.send({ success: true, data: rows, meta: { ...meta(request), variant } })
}
