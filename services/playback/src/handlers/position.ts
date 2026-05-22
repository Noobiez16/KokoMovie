import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { upsertPosition, getPosition, getPositionsForProfile, getSession, recordHistory } from '../db/dynamo.js'
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

interface CatalogContentMetadata {
  title: string
  type: string
  s3Thumbnail: string | null
  backdropUrl: string | null
  releaseYear: number | null
}

const catalogCache = new Map<string, CatalogContentMetadata>()

async function getCatalogMetadata(contentId: string, authorizationHeader: string | undefined): Promise<CatalogContentMetadata | null> {
  if (catalogCache.has(contentId)) {
    return catalogCache.get(contentId)!
  }

  try {
    const headers: Record<string, string> = {}
    if (authorizationHeader) {
      headers['Authorization'] = authorizationHeader
    }
    const response = await fetch(`http://localhost:3002/catalog/content/${contentId}`, {
      headers,
    })
    if (!response.ok) {
      return null
    }
    const json = (await response.json()) as {
      success: boolean
      data?: {
        title: string
        type: string
        s3Thumbnail: string | null
        backdropUrl: string | null
        releaseYear: number | null
      }
    }
    if (json.success && json.data) {
      const meta: CatalogContentMetadata = {
        title: json.data.title,
        type: json.data.type,
        s3Thumbnail: json.data.s3Thumbnail ?? null,
        backdropUrl: json.data.backdropUrl ?? null,
        releaseYear: json.data.releaseYear ?? null,
      }
      catalogCache.set(contentId, meta)
      return meta
    }
  } catch (error) {
    console.error('Error fetching catalog metadata:', error)
  }
  return null
}

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

  // Record history directly to DynamoDB viewing_history table since Kafka events are disabled
  try {
    const session = await getSession(sessionId)
    const watchedAt = session?.createdAt ?? now
    const meta = await getCatalogMetadata(contentId, request.headers.authorization)
    if (meta) {
      await recordHistory({
        profileId,
        contentId,
        contentTitle: meta.title,
        contentType: meta.type,
        thumbnailUrl: meta.s3Thumbnail,
        positionSeconds,
        durationSeconds,
        completedAt: isCompleted ? now : null,
        watchedAt,
        episodeId: episodeId ?? null,
      })
    }
  } catch (historyErr) {
    request.log.error(historyErr, 'Failed to record watch history directly to DynamoDB')
  }

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

  const enriched = (await Promise.all(
    continueWatching.map(async (p) => {
      const [contentId, episodePart] = p.contentEpisodeId.split('#')
      if (!contentId) return null
      const episodeId = episodePart === 'movie' ? null : (episodePart ?? null)
      const meta = await getCatalogMetadata(contentId, request.headers.authorization)
      return {
        contentId,
        episodeId,
        positionSeconds: p.positionSeconds,
        durationSeconds: p.durationSeconds,
        contentEpisodeId: p.contentEpisodeId,
        updatedAt: p.updatedAt,
        // Enriched catalog fields
        title: meta?.title ?? 'Unknown Content',
        type: (meta?.type as 'movie' | 'series') ?? 'movie',
        s3Thumbnail: meta?.s3Thumbnail ?? null,
        backdropUrl: meta?.backdropUrl ?? null,
        releaseYear: meta?.releaseYear ?? null,
      }
    })
  )).filter((item): item is NonNullable<typeof item> => item !== null)

  return reply.send({
    success: true,
    data: enriched,
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  })
}
