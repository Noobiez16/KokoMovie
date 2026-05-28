import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getHistory, deleteHistoryItem } from '../db/dynamo.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

interface CatalogEpisodeMetadata {
  id: string
  episodeNumber: number
  title: string
}

interface CatalogSeasonMetadata {
  seasonNumber: number
  episodes: CatalogEpisodeMetadata[]
}

interface CatalogContentDetail {
  title: string
  type: string
  seasons?: CatalogSeasonMetadata[]
}

const catalogCache = new Map<string, CatalogContentDetail>()

async function getCatalogContentDetail(
  contentId: string,
  authorizationHeader: string | undefined
): Promise<CatalogContentDetail | null> {
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
      data?: CatalogContentDetail
    }
    if (json.success && json.data) {
      catalogCache.set(contentId, json.data)
      return json.data
    }
  } catch (error) {
    console.error('Error fetching catalog content detail in user service:', error)
  }
  return null
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

  // Enrich with catalog details (episode title, season/episode number)
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      if (item.contentType === 'series' && item.episodeId) {
        const detail = await getCatalogContentDetail(item.contentId, request.headers.authorization)
        if (detail && detail.seasons) {
          let foundEpisode: CatalogEpisodeMetadata | undefined
          let foundSeasonNumber: number | undefined
          for (const s of detail.seasons) {
            const ep = s.episodes.find((e) => e.id === item.episodeId)
            if (ep) {
              foundEpisode = ep
              foundSeasonNumber = s.seasonNumber
              break
            }
          }
          if (foundEpisode) {
            return {
              ...item,
              episodeNumber: foundEpisode.episodeNumber,
              seasonNumber: foundSeasonNumber,
              episodeTitle: foundEpisode.title,
            }
          }
        }
      }
      return item
    })
  )

  const nextCursor = lastKey
    ? Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64url')
    : undefined

  return reply.send({
    success: true,
    data: enrichedItems,
    meta: { ...meta(request), nextCursor, total: enrichedItems.length },
  })
}

export async function deleteHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({
      success: false,
      error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' },
      meta: meta(request),
    })
  }

  const query = z.object({
    watchedAtContentId: z.string().min(1),
  }).safeParse(request.query)

  if (!query.success) {
    return reply.code(422).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'watchedAtContentId query param is required' },
      meta: meta(request),
    })
  }

  await deleteHistoryItem(req.profileId, query.data.watchedAtContentId)

  return reply.send({
    success: true,
    data: null,
    meta: meta(request),
  })
}
