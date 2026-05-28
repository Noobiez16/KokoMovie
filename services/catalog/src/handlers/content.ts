import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { db } from '../db/connection.js'
import { content, genres, contentGenres, castMembers, contentCast, seasons, episodes } from '../db/schema.js'
import { redis } from '../redis/client.js'
import { eq, and, asc } from 'drizzle-orm'
import {
  createTmdbClient, posterUrl, backdropUrl, tmdbContentId, TMDB_GENRE_MAP,
  decodeTmdbContentId,
  type TmdbMovieDetail, type TmdbTvDetail,
} from '../lib/tmdb.js'
import { syncMovie, syncTv } from '../lib/tmdb-sync.js'

const paramsSchema = z.object({ id: z.string() })

function getTmdbKey(request?: FastifyRequest): string {
  const headerKey = request?.headers['x-tmdb-key'] as string | undefined
  return headerKey?.trim() || ''
}

function hasTmdb(request?: FastifyRequest): boolean {
  return getTmdbKey(request).length > 0
}

function tmdb(request?: FastifyRequest) {
  return createTmdbClient(getTmdbKey(request))
}

export async function getContentHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = paramsSchema.safeParse(request.params)
  if (!params.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: params.error.message },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const { id } = params.data

  // Check local DB first
  const [row] = await db.select().from(content).where(eq(content.id, id)).limit(1)

  // If found in DB with tmdb_id, fetch full TMDB detail if not already synced (no imdb_id means not fully synced)
  if (row?.tmdbId && hasTmdb(request) && !row.imdbId) {
    try {
      const syncedId = row.type === 'movie'
        ? await syncMovie(tmdb(request), row.tmdbId)
        : await syncTv(tmdb(request), row.tmdbId)
      if (syncedId) {
        const [refreshed] = await db.select().from(content).where(eq(content.id, syncedId)).limit(1)
        if (refreshed) {
          return serveFromDb(refreshed.id, request, reply)
        }
      }
    } catch (e) {
      request.log.error(e, 'Failed to sync content details')
    }
  }

  if (row) return serveFromDb(id, request, reply)

  // Not in DB — try to resolve via TMDB directly if key is set
  // (This handles cases where the ID was generated client-side before DB sync, or on page reload)
  if (hasTmdb(request)) {
    const decoded = decodeTmdbContentId(id)
    if (decoded) {
      try {
        const syncedId = decoded.type === 'movie'
          ? await syncMovie(tmdb(request), decoded.tmdbId)
          : await syncTv(tmdb(request), decoded.tmdbId)
        
        // Re-fetch from DB after sync
        if (syncedId) {
          const [refreshed] = await db.select().from(content).where(eq(content.id, syncedId)).limit(1)
          if (refreshed) {
            return serveFromDb(refreshed.id, request, reply)
          }
        }
      } catch (e) {
        request.log.error(e, 'Failed to sync content on the fly')
      }
    }
  }

  return reply.code(404).send({
    success: false,
    error: { code: 'CONTENT_NOT_FOUND', message: 'Content not found' },
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  })
}

async function serveFromDb(id: string, request: FastifyRequest, reply: FastifyReply) {
  const cacheKey = `content:${id}`

  const [row] = await db.select().from(content).where(and(eq(content.id, id), eq(content.isActive, true))).limit(1)
  if (!row) {
    return reply.code(404).send({
      success: false,
      error: { code: 'CONTENT_NOT_FOUND', message: 'Content not found' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const genreRows = await db
    .select({ id: genres.id, name: genres.name, slug: genres.slug })
    .from(genres).innerJoin(contentGenres, eq(contentGenres.genreId, genres.id))
    .where(eq(contentGenres.contentId, id))

  const castRows = await db
    .select({ id: castMembers.id, name: castMembers.name, photoUrl: castMembers.photoUrl, role: contentCast.role, order: contentCast.order })
    .from(castMembers).innerJoin(contentCast, eq(contentCast.castMemberId, castMembers.id))
    .where(eq(contentCast.contentId, id)).orderBy(asc(contentCast.order))

  let seasonsData: object[] = []
  if (row.type === 'series') {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.contentId, id)).orderBy(asc(seasons.seasonNumber))
    seasonsData = await Promise.all(
      seasonRows.map(async (s) => {
        let episodeRows = await db.select().from(episodes).where(eq(episodes.seasonId, s.id)).orderBy(asc(episodes.episodeNumber))
        // Lazy-load episodes from TMDB if season has none (handles old syncs that only fetched season 1)
        if (episodeRows.length === 0 && row.tmdbId && hasTmdb(request)) {
          try {
            const seasonDetail = await tmdb(request).getSeason(row.tmdbId, s.seasonNumber as unknown as number)
            for (const ep of seasonDetail.episodes ?? []) {
              await db.insert(episodes).values({
                seasonId: s.id,
                contentId: id,
                episodeNumber: ep.episode_number as unknown as number,
                title: ep.name ?? `Episode ${ep.episode_number}`,
                description: ep.overview ?? null,
                durationMins: ep.runtime as unknown as number ?? null,
                s3ThumbnailKey: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
                airDate: ep.air_date ?? null,
              }).onConflictDoNothing()
            }
            episodeRows = await db.select().from(episodes).where(eq(episodes.seasonId, s.id)).orderBy(asc(episodes.episodeNumber))
          } catch { /* leave empty */ }
        }
        return { ...s, episodes: episodeRows }
      })
    )
  }

  const responseBody = {
    success: true,
    data: { ...row, genres: genreRows, cast: castRows, seasons: seasonsData },
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  }

  await redis.setex(cacheKey, 1800, JSON.stringify(responseBody))
  return reply.send(responseBody)
}

// Sync a TMDB item on first view (called by client when content detail is requested for a TMDB item not in DB)
export async function syncContentHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!hasTmdb(request)) return reply.code(503).send({ success: false, error: { code: 'NO_TMDB', message: 'TMDB not configured' }, meta: {} })

  const body = z.object({
    tmdbId: z.number().int().positive(),
    type: z.enum(['movie', 'tv']),
  }).safeParse(request.body)
  if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message }, meta: {} })

  const { tmdbId, type } = body.data
  const client = tmdb(request)

  try {
    const id = type === 'movie' ? await syncMovie(client, tmdbId) : await syncTv(client, tmdbId)
    return reply.send({ success: true, data: { id }, meta: { requestId: request.id, timestamp: new Date().toISOString() } })
  } catch (e) {
    return reply.code(500).send({
      success: false,
      error: { code: 'SYNC_ERROR', message: String(e) },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }
}

export async function getGenresHandler(request: FastifyRequest, reply: FastifyReply) {
  const cacheKey = 'genres:all'
  const cached = await redis.get(cacheKey)
  if (cached) return reply.send(JSON.parse(cached))

  const rows = await db.select().from(genres).orderBy(asc(genres.name))
  const responseBody = { success: true, data: rows, meta: { requestId: request.id, timestamp: new Date().toISOString() } }
  await redis.setex(cacheKey, 86400, JSON.stringify(responseBody))
  return reply.send(responseBody)
}

// Keep ingest for manual additions
const ingestBodySchema = z.object({
  title: z.string().min(1),
  type: z.enum(['movie', 'series']),
  description: z.string().optional(),
  releaseYear: z.number().int().optional(),
  imdbScore: z.number().optional(),
  durationMins: z.number().int().optional(),
  s3Thumbnail: z.string().optional(),
  s3HlsKey: z.string().optional(),
  tmdbId: z.number().int().optional(),
  imdbId: z.string().optional(),
  genres: z.array(z.string()).optional(),
})

export async function ingestContentHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = ingestBodySchema.safeParse(request.body)
  if (!body.success) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message }, meta: {} })

  const { genres: genreNames, ...data } = body.data
  const [inserted] = await db.insert(content).values({
    ...data,
    releaseYear: data.releaseYear as unknown as number ?? null,
    imdbScore: data.imdbScore?.toString(),
    planMinimum: 'basic',
  }).returning()

  if (!inserted) throw new Error('Insert returned no rows')

  if (genreNames?.length) {
    for (const slug of genreNames) {
      const [g] = await db.select().from(genres).where(eq(genres.slug, slug)).limit(1)
      if (g) await db.insert(contentGenres).values({ contentId: inserted.id, genreId: g.id }).onConflictDoNothing()
    }
  }

  return reply.code(201).send({ success: true, data: inserted, meta: { requestId: request.id, timestamp: new Date().toISOString() } })
}
