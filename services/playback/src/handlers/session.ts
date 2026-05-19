import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { createSession, getSession } from '../db/dynamo.js'
import { generateSignedUrl } from '../lib/cloudfront.js'
import { emitPlaybackEvent } from '../kafka/producer.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

const sessionBodySchema = z.object({
  contentId: z.string().uuid(),
  episodeId: z.string().uuid().optional(),
  s3HlsKey: z.string().min(1),
  drmKeyId: z.string().uuid().optional(),
  durationSeconds: z.number().int().positive(),
})

export async function createSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = sessionBodySchema.safeParse(request.body)
  if (!body.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: body.error.message },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const req = request as unknown as AuthenticatedRequest
  const profileId = req.profileId ?? req.accountId

  const { contentId, episodeId, s3HlsKey, drmKeyId, durationSeconds } = body.data

  const sessionId = uuidv4()
  const signedUrl = generateSignedUrl(s3HlsKey)
  const now = new Date().toISOString()
  const ttl = Math.floor(Date.now() / 1000) + 86400 // 24-hour session TTL

  await createSession({
    sessionId,
    profileId,
    contentId,
    episodeId: episodeId ?? null,
    signedUrl,
    drmKeyId: drmKeyId ?? null,
    createdAt: now,
    ttl,
  })

  await emitPlaybackEvent({
    profileId,
    contentId,
    episodeId: episodeId ?? null,
    sessionId,
    eventType: 'started',
    positionSeconds: 0,
    durationSeconds,
    quality: 'auto',
    timestamp: now,
  })

  return reply.code(201).send({
    success: true,
    data: {
      sessionId,
      manifestUrl: signedUrl,
      drmKeyId: drmKeyId ?? null,
      expiresIn: 900,
    },
    meta: { requestId: request.id, timestamp: now },
  })
}

export async function getSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = z.object({ sessionId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: params.error.message },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const session = await getSession(params.data.sessionId)
  if (!session) {
    return reply.code(404).send({
      success: false,
      error: { code: 'CONTENT_NOT_FOUND', message: 'Session not found' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  return reply.send({
    success: true,
    data: session,
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  })
}
