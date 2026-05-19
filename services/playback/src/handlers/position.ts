import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { upsertPosition, getPosition, getPositionsForProfile } from '../db/dynamo.js'
import { emitPlaybackEvent } from '../kafka/producer.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

const heartbeatSchema = z.object({
  contentId: z.string().uuid(),
  episodeId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  positionSeconds: z.number().min(0),
  durationSeconds: z.number().int().positive(),
  quality: z.string().default('auto'),
})

const getPositionParamsSchema = z.object({ contentId: z.string().uuid() })
const getPositionQuerySchema = z.object({ episodeId: z.string().uuid().optional() })

const TTL_90_DAYS = 90 * 24 * 60 * 60

export async function heartbeatHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = heartbeatSchema.safeParse(request.body)
  if (!body.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: body.error.message },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const req = request as unknown as AuthenticatedRequest
  const profileId = req.profileId ?? req.accountId
  const { contentId, episodeId, sessionId, positionSeconds, durationSeconds, quality } = body.data

  const contentEpisodeId = episodeId ? `${contentId}#${episodeId}` : `${contentId}#movie`
  const now = new Date().toISOString()
  const isCompleted = durationSeconds > 0 && positionSeconds / durationSeconds > 0.95

  await upsertPosition({
    profileId,
    contentEpisodeId,
    positionSeconds,
    durationSeconds,
    completedAt: isCompleted ? now : null,
    updatedAt: now,
    ttl: Math.floor(Date.now() / 1000) + TTL_90_DAYS,
  })

  await emitPlaybackEvent({
    profileId,
    contentId,
    episodeId: episodeId ?? null,
    sessionId,
    eventType: isCompleted ? 'completed' : 'heartbeat',
    positionSeconds,
    durationSeconds,
    quality,
    timestamp: now,
  })

  return reply.code(204).send()
}

export async function getPositionHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = getPositionParamsSchema.safeParse(request.params)
  const query = getPositionQuerySchema.safeParse(request.query)

  if (!params.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: params.error.message },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const req = request as unknown as AuthenticatedRequest
  const profileId = req.profileId ?? req.accountId
  const { contentId } = params.data
  const episodeId = query.data?.episodeId

  const contentEpisodeId = episodeId ? `${contentId}#${episodeId}` : `${contentId}#movie`
  const position = await getPosition(profileId, contentEpisodeId)

  return reply.send({
    success: true,
    data: position ?? { positionSeconds: 0, durationSeconds: 0, completedAt: null },
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  })
}

export async function getContinueWatchingHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as unknown as AuthenticatedRequest
  const profileId = req.profileId ?? req.accountId

  const positions = await getPositionsForProfile(profileId)

  const continueWatching = positions
    .filter((p) => {
      if (!p.durationSeconds) return false
      const pct = p.positionSeconds / p.durationSeconds
      return pct > 0.05 && pct < 0.95
    })
    .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
    .slice(0, 20)

  return reply.send({
    success: true,
    data: continueWatching,
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  })
}
