import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { profiles } from '../db/schema.js'
import { config } from '../config.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const presignSchema = z.object({
  contentType: z.string().refine((v) => ALLOWED_TYPES.includes(v), {
    message: `contentType must be one of ${ALLOWED_TYPES.join(', ')}`,
  }),
  filename: z.string().min(1).max(100),
})

export async function presignAvatarHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' }, meta: meta(request) })
  }

  const body = presignSchema.safeParse(request.body)
  if (!body.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.issues[0]?.message ?? 'Invalid input' }, meta: meta(request) })
  }

  const ext = body.data.contentType.split('/')[1] ?? 'jpg'
  const s3Key = `avatars/${req.accountId}/${req.profileId}.${ext}`

  // Dev mode: no real S3
  if (!config.CLOUDFRONT_ASSETS_URL) {
    return reply.send({
      success: true,
      data: {
        uploadUrl: `http://localhost:4566/${config.S3_ASSETS_BUCKET}/${s3Key}`,
        cdnUrl: `/avatars/${req.profileId}.${ext}`,
        s3Key,
        expiresIn: 300,
      },
      meta: meta(request),
    })
  }

  // Prod: generate real S3 presigned PUT URL via dynamic import (avoids bundling S3 SDK in dev)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3' as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner' as any)

  const s3 = new S3Client({ region: config.AWS_REGION })
  const cmd = new PutObjectCommand({
    Bucket: config.S3_ASSETS_BUCKET,
    Key: s3Key,
    ContentType: body.data.contentType,
    ACL: 'private',
  })
  const uploadUrl: string = await getSignedUrl(s3, cmd, { expiresIn: 300 })
  const cdnUrl = `${config.CLOUDFRONT_ASSETS_URL}/${s3Key}`

  return reply.send({
    success: true,
    data: { uploadUrl, cdnUrl, s3Key, expiresIn: 300 },
    meta: meta(request),
  })
}

const confirmSchema = z.object({ cdnUrl: z.string().min(1) })

export async function confirmAvatarHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' }, meta: meta(request) })
  }

  const body = confirmSchema.safeParse(request.body)
  if (!body.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'cdnUrl required' }, meta: meta(request) })
  }

  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, req.profileId), eq(profiles.accountId, req.accountId), isNull(profiles.deletedAt)),
  })
  if (!profile) {
    return reply.code(404).send({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' }, meta: meta(request) })
  }

  await db.update(profiles)
    .set({ avatarUrl: body.data.cdnUrl, updatedAt: new Date() })
    .where(eq(profiles.id, req.profileId))

  return reply.send({ success: true, data: { avatarUrl: body.data.cdnUrl }, meta: meta(request) })
}
