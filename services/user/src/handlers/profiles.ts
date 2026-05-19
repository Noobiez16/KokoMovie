import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { and, eq, isNull, count } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { profiles } from '../db/schema.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

const MAX_PROFILES = 5

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

export async function listProfilesHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  const list = await db.query.profiles.findMany({
    where: and(eq(profiles.accountId, req.accountId), isNull(profiles.deletedAt)),
    orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)],
  })

  return reply.send({
    success: true,
    data: list.map(toDto),
    meta: meta(request),
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(50),
  isKids: z.boolean().optional().default(false),
  language: z.string().max(10).optional().default('en-US'),
  maturityRating: z.enum(['G', 'PG', 'PG-13', 'R', 'TV-MA']).optional().default('TV-MA'),
})

export async function createProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  const body = createSchema.safeParse(request.body)
  if (!body.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten().fieldErrors }, meta: meta(request) })
  }

  const countResult = await db
    .select({ total: count() })
    .from(profiles)
    .where(and(eq(profiles.accountId, req.accountId), isNull(profiles.deletedAt)))
  const total = countResult[0]?.total ?? 0

  if ((total as number) >= MAX_PROFILES) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_LIMIT_REACHED', message: 'Maximum 5 profiles per account' }, meta: meta(request) })
  }

  const [profile] = await db.insert(profiles).values({
    accountId: req.accountId,
    name: body.data.name,
    isKids: body.data.isKids,
    language: body.data.language,
    maturityRating: body.data.maturityRating,
    sortOrder: total as number,
  }).returning()

  if (!profile) throw new Error('Failed to create profile')

  return reply.code(201).send({ success: true, data: toDto(profile), meta: meta(request) })
}

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  isKids: z.boolean().optional(),
  language: z.string().max(10).optional(),
  maturityRating: z.enum(['G', 'PG', 'PG-13', 'R', 'TV-MA']).optional(),
  autoplay: z.boolean().optional(),
  subtitleDefault: z.string().max(10).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
})

export async function updateProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
  if (!params.success) return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid profile ID' }, meta: meta(request) })

  const body = updateSchema.safeParse(request.body)
  if (!body.success) return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' }, meta: meta(request) })

  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, params.data.id), eq(profiles.accountId, req.accountId), isNull(profiles.deletedAt)),
  })
  if (!profile) return reply.code(404).send({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' }, meta: meta(request) })

  const [updated] = await db
    .update(profiles)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(profiles.id, profile.id))
    .returning()

  return reply.send({ success: true, data: toDto(updated!), meta: meta(request) })
}

export async function deleteProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
  if (!params.success) return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid profile ID' }, meta: meta(request) })

  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, params.data.id), eq(profiles.accountId, req.accountId), isNull(profiles.deletedAt)),
  })
  if (!profile) return reply.code(404).send({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' }, meta: meta(request) })

  await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.id, profile.id))

  return reply.send({ success: true, data: null, meta: meta(request) })
}

function toDto(p: typeof profiles.$inferSelect) {
  return {
    id: p.id,
    accountId: p.accountId,
    name: p.name,
    avatarUrl: p.avatarUrl,
    isKids: p.isKids,
    maturityRating: p.maturityRating,
    language: p.language,
    autoplay: p.autoplay,
    subtitleDefault: p.subtitleDefault,
    createdAt: p.createdAt.toISOString(),
  }
}
