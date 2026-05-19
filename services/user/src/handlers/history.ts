import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getHistory } from '../db/dynamo.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

export async function getHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' }, meta: meta(request) })
  }

  const query = z.object({
    limit: z.coerce.number().min(1).max(100).default(50),
    cursor: z.string().optional(),
  }).safeParse(request.query)

  if (!query.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' }, meta: meta(request) })
  }

  let exclusiveStartKey: Record<string, unknown> | undefined
  if (query.data.cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(query.data.cursor, 'base64url').toString('utf-8'))
    } catch {
      return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid cursor' }, meta: meta(request) })
    }
  }

  const { items, lastKey } = await getHistory(req.profileId, query.data.limit, exclusiveStartKey)

  const nextCursor = lastKey
    ? Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64url')
    : undefined

  return reply.send({
    success: true,
    data: items,
    meta: { ...meta(request), nextCursor, total: items.length },
  })
}
