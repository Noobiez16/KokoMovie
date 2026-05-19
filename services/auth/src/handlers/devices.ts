import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { deviceSessions, refreshTokens } from '../db/schema.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

export async function listDevicesHandler(
  request: FastifyRequest & { accountId: string; currentSessionId?: string },
  reply: FastifyReply,
) {
  const sessions = await db.query.deviceSessions.findMany({
    where: and(eq(deviceSessions.accountId, request.accountId), isNull(deviceSessions.revokedAt)),
    orderBy: (t, { desc }) => [desc(t.lastActiveAt)],
  })

  return reply.send({
    success: true,
    data: sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      platform: s.platform,
      lastActiveAt: s.lastActiveAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      isCurrent: s.id === request.currentSessionId,
    })),
    meta: meta(request),
  })
}

const paramsSchema = z.object({ id: z.string().uuid() })

export async function revokeDeviceHandler(
  request: FastifyRequest & { accountId: string; currentSessionId?: string },
  reply: FastifyReply,
) {
  const params = paramsSchema.safeParse(request.params)
  if (!params.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid device ID' }, meta: meta(request) })
  }

  const session = await db.query.deviceSessions.findFirst({
    where: and(
      eq(deviceSessions.id, params.data.id),
      eq(deviceSessions.accountId, request.accountId),
      isNull(deviceSessions.revokedAt),
    ),
  })

  if (!session) {
    return reply.code(404).send({ success: false, error: { code: 'AUTH_DEVICE_NOT_FOUND', message: 'Device session not found' }, meta: meta(request) })
  }

  // Revoke session + all associated refresh tokens
  await db.update(deviceSessions).set({ revokedAt: new Date() }).where(eq(deviceSessions.id, session.id))
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.deviceSessionId, session.id), isNull(refreshTokens.revokedAt)))

  return reply.send({
    success: true,
    data: null,
    meta: meta(request),
  })
}
