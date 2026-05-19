import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { cacheGet, cacheSet } from '../lib/redis.js'
import { getSimilarItems } from '../lib/personalize.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

export async function getSimilarHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = z.object({ contentId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid contentId' }, meta: meta(request) })
  }

  const cacheKey = `rec:similar:${params.data.contentId}`
  const cached = await cacheGet<object[]>(cacheKey)
  if (cached) return reply.send({ success: true, data: cached, meta: { ...meta(request), cached: true } })

  const items = await getSimilarItems(params.data.contentId, 12)
  await cacheSet(cacheKey, items, 120)

  return reply.send({ success: true, data: items, meta: meta(request) })
}
