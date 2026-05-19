import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { acquireWidevineLicense } from '../lib/drm.js'

const drmQuerySchema = z.object({
  contentId: z.string().uuid(),
  sessionId: z.string().uuid(),
})

export async function drmLicenseHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = drmQuerySchema.safeParse(request.query)
  if (!query.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: query.error.message },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const challenge = request.body as Buffer
  if (!challenge || challenge.length === 0) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'License challenge body is required' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  try {
    const { license } = await acquireWidevineLicense(challenge, query.data.contentId, null)
    return reply.send({
      success: true,
      data: { license },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  } catch (err) {
    return reply.code(403).send({
      success: false,
      error: { code: 'DRM_LICENSE_DENIED', message: 'Failed to acquire DRM license' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }
}
