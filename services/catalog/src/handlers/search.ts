import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { createTmdbClient, tmdbContentId, posterUrl, backdropUrl, tmdbTitle, tmdbType, tmdbYear } from '../lib/tmdb.js'

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  type: z.enum(['movie', 'series']).optional(),
  page: z.coerce.number().int().min(1).default(1),
})

function getTmdbKey(request?: FastifyRequest): string {
  const headerKey = request?.headers['x-tmdb-key'] as string | undefined
  return headerKey?.trim() || ''
}

function toSummary(item: { id: number; title?: string; name?: string; overview: string | null; poster_path: string | null; backdrop_path: string | null; release_date?: string; first_air_date?: string; vote_average: number; media_type?: string }) {
  const type = (item.media_type === 'tv' || item.name !== undefined) ? 'series' : 'movie'
  const tmdbType_ = type === 'series' ? 'tv' : 'movie'
  return {
    id: tmdbContentId(tmdbType_, item.id),
    title: item.title ?? item.name ?? 'Unknown',
    type,
    releaseYear: (item.release_date ?? item.first_air_date) ? parseInt((item.release_date ?? item.first_air_date ?? '').slice(0, 4)) : null,
    rating: null,
    imdbScore: item.vote_average > 0 ? item.vote_average.toFixed(1) : null,
    durationMins: null,
    s3Thumbnail: posterUrl(item.poster_path),
    backdropUrl: backdropUrl(item.backdrop_path),
    planMinimum: 'basic',
    tmdbId: item.id,
    imdbId: null,
  }
}

export async function searchHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsed = searchQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const { q, type, page } = parsed.data
  const tmdbKey = getTmdbKey(request)

  if (!tmdbKey) {
    return reply.send({
      success: true,
      data: [],
      meta: { requestId: request.id, timestamp: new Date().toISOString(), query: q, total: 0 },
    })
  }

  try {
    const client = createTmdbClient(tmdbKey)
    const results = await client.searchMulti(q, page)
    let items = results.results
      .filter(i => i.media_type !== 'person')
      .map(toSummary)

    if (type) items = items.filter(i => i.type === type)

    return reply.send({
      success: true,
      data: items,
      meta: { requestId: request.id, timestamp: new Date().toISOString(), query: q, total: items.length },
    })
  } catch (e) {
    return reply.code(500).send({
      success: false,
      error: { code: 'SEARCH_ERROR', message: 'Search failed' },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }
}

// Semantic search now just delegates to regular TMDB search (Claude expansion is optional)
export async function semanticSearchHandler(request: FastifyRequest, reply: FastifyReply) {
  return searchHandler(request, reply)
}
