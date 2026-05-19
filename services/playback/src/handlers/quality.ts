import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { emitPlaybackEvent } from '../kafka/producer.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

const qualityReportSchema = z.object({
  sessionId: z.string().uuid(),
  contentId: z.string().uuid(),
  episodeId: z.string().uuid().optional(),
  quality: z.string(),
  positionSeconds: z.number().min(0),
  durationSeconds: z.number().int().positive(),
  bandwidth: z.number().optional(),
  bufferLength: z.number().optional(),
})

export async function qualityReportHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = qualityReportSchema.safeParse(request.body)
  if (!body.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: body.error.message },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const req = request as unknown as AuthenticatedRequest
  const profileId = req.profileId ?? req.accountId
  const { sessionId, contentId, episodeId, quality, positionSeconds, durationSeconds } = body.data

  await emitPlaybackEvent({
    profileId,
    contentId,
    episodeId: episodeId ?? null,
    sessionId,
    eventType: 'quality_change',
    positionSeconds,
    durationSeconds,
    quality,
    timestamp: new Date().toISOString(),
  })

  return reply.code(204).send()
}
