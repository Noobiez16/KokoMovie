import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { profiles } from '../db/schema.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

export async function getPreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' }, meta: meta(request) })
  }

  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, req.profileId), eq(profiles.accountId, req.accountId), isNull(profiles.deletedAt)),
  })

  if (!profile) {
    return reply.code(404).send({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' }, meta: meta(request) })
  }

  return reply.send({
    success: true,
    data: {
      language: profile.language,
      subtitleDefault: profile.subtitleDefault,
      autoplay: profile.autoplay,
      maturityRating: profile.maturityRating,
      isKids: profile.isKids,
    },
    meta: meta(request),
  })
}

const updateSchema = z.object({
  language: z.string().max(10).optional(),
  subtitleDefault: z.string().max(10).nullable().optional(),
  autoplay: z.boolean().optional(),
  maturityRating: z.enum(['G', 'PG', 'PG-13', 'R', 'TV-MA']).optional(),
})

export async function updatePreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' }, meta: meta(request) })
  }

  const body = updateSchema.safeParse(request.body)
  if (!body.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten().fieldErrors }, meta: meta(request) })
  }

  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, req.profileId), eq(profiles.accountId, req.accountId), isNull(profiles.deletedAt)),
  })

  if (!profile) {
    return reply.code(404).send({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' }, meta: meta(request) })
  }

  const [updated] = await db
    .update(profiles)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(profiles.id, req.profileId))
    .returning()

  return reply.send({
    success: true,
    data: {
      language: updated!.language,
      subtitleDefault: updated!.subtitleDefault,
      autoplay: updated!.autoplay,
      maturityRating: updated!.maturityRating,
      isKids: updated!.isKids,
    },
    meta: meta(request),
  })
}
