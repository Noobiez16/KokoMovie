import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { db } from '../db/connection.js'
import { content, genres, contentGenres } from '../db/schema.js'
import { redis } from '../redis/client.js'
import { config } from '../config.js'
import { eq, and, inArray, desc, sql } from 'drizzle-orm'
import { createTmdbClient, tmdbContentId, posterUrl, backdropUrl, tmdbTitle, tmdbType, tmdbYear, TMDB_GENRE_MAP } from '../lib/tmdb.js'
import { syncTrending, syncPopular } from '../lib/tmdb-sync.js'

const browseQuerySchema = z.object({
  genre: z.string().optional(),
  type: z.enum(['movie', 'series']).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

function hasTmdb() {
  return config.TMDB_API_KEY.length > 0
}

function tmdb() {
  return createTmdbClient(config.TMDB_API_KEY)
}

interface TmdbVideo {
  key: string
  site: string
  type: string
  name?: string
}

function findBestTrailer(videos: TmdbVideo[]): TmdbVideo | null {
  if (!videos || videos.length === 0) return null
  const youtubeVideos = videos.filter(v => v.site === 'YouTube')
  if (youtubeVideos.length === 0) return null

  // Filter out vertical videos / Shorts / TikTok / Vertical trailers
  const longFormVideos = youtubeVideos.filter(v => {
    const name = (v.name || '').toLowerCase()
    return !name.includes('short') && !name.includes('#short') && !name.includes('vertical') && !name.includes('tiktok')
  })

  const candidates = longFormVideos.length > 0 ? longFormVideos : youtubeVideos

  // 1. First, search for Trailer
  const trailer = candidates.find(v => v.type === 'Trailer')
  if (trailer) return trailer

  // 2. Fall back to Teaser
  const teaser = candidates.find(v => v.type === 'Teaser')
  if (teaser) return teaser

  // 3. Fall back to first candidate
  return candidates[0] ?? null
}

// ─── Browse ─────────────────────────────────────────────────────────────────

export async function browseHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsed = browseQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      meta: { requestId: request.id, timestamp: new Date().toISOString() },
    })
  }

  const { genre, type, year, page, limit } = parsed.data
  const cacheKey = `browse:${JSON.stringify(parsed.data)}`
  const cached = await redis.get(cacheKey)
  if (cached) return reply.send(JSON.parse(cached))

  // If TMDB key is set, retrieve from TMDB to show a giant catalog
  if (hasTmdb()) {
    try {
      const client = tmdb()
      let genreId: number | undefined
      if (genre) {
        const entry = Object.entries(TMDB_GENRE_MAP).find(([_, slug]) => slug === genre)
        if (entry) {
          genreId = Number(entry[0])
        }
      }

      // TMDB returns 20 items per page. Calculate the range of TMDB pages to fetch.
      const offset = (page - 1) * limit
      const startPage = Math.floor(offset / 20) + 1
      const endPage = Math.floor((offset + limit - 1) / 20) + 1

      const pagePromises: Promise<{ results: any[]; total_results: number; total_pages: number }>[] = []
      for (let p = startPage; p <= endPage; p++) {
        pagePromises.push(
          type === 'movie'
            ? client.discoverMovie(genreId, p, year)
            : type === 'series'
            ? client.discoverTv(genreId, p, year)
            : Promise.all([
                client.discoverMovie(genreId, p, year),
                client.discoverTv(genreId, p, year)
              ]).then(([m, t]) => {
                const combined = []
                const maxLength = Math.max(m.results.length, t.results.length)
                for (let i = 0; i < maxLength; i++) {
                  if (m.results[i]) combined.push(m.results[i])
                  if (t.results[i]) combined.push(t.results[i])
                }
                return {
                  results: combined,
                  total_results: m.total_results + t.total_results,
                  total_pages: Math.max(m.total_pages, t.total_pages)
                }
              })
        )
      }

      const results = await Promise.all(pagePromises)
      let allItems: any[] = []
      let total = 0
      let maxPages = 1

      for (const res of results) {
        allItems = allItems.concat(res.results)
        total = Math.max(total, res.total_results)
        maxPages = Math.max(maxPages, res.total_pages)
      }

      // Slice the exact items we want out of the combined pages
      const startIdx = offset % 20
      const itemsSlice = allItems.slice(startIdx, startIdx + limit)

      const rows = itemsSlice
        .filter(i => i.media_type !== 'person')
        .map(i => ({
          id: tmdbContentId(tmdbType(i) === 'series' ? 'tv' : 'movie', i.id),
          title: tmdbTitle(i),
          type: tmdbType(i),
          releaseYear: tmdbYear(i),
          rating: null,
          imdbScore: i.vote_average > 0 ? i.vote_average.toFixed(1) : null,
          durationMins: null,
          s3Thumbnail: posterUrl(i.poster_path),
          backdropUrl: backdropUrl(i.backdrop_path),
          planMinimum: 'basic',
          tmdbId: i.id,
          imdbId: null,
        }))

      // Normalize pagination output for UI client
      const pages = Math.ceil(total / limit)

      const responseBody = {
        success: true,
        data: rows,
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
          pagination: { page, limit, total, pages },
        },
      }
      await redis.setex(cacheKey, 1800, JSON.stringify(responseBody))
      return reply.send(responseBody)
    } catch (e) {
      // TMDB failed — fall through to local DB
    }
  }

  const conditions = [eq(content.isActive, true)]
  if (type) conditions.push(eq(content.type, type))
  if (year) conditions.push(eq(content.releaseYear, year))

  let rows
  if (genre) {
    const [genreRow] = await db.select({ id: genres.id }).from(genres).where(eq(genres.slug, genre)).limit(1)
    if (!genreRow) {
      return reply.code(404).send({
        success: false,
        error: { code: 'CONTENT_NOT_FOUND', message: 'Genre not found' },
        meta: { requestId: request.id, timestamp: new Date().toISOString() },
      })
    }
    const ids = (await db.select({ contentId: contentGenres.contentId }).from(contentGenres).where(eq(contentGenres.genreId, genreRow.id)).limit(20)).map(r => r.contentId)
    rows = ids.length ? await db.select({ id: content.id, title: content.title, type: content.type, releaseYear: content.releaseYear, rating: content.rating, imdbScore: content.imdbScore, durationMins: content.durationMins, s3Thumbnail: content.s3Thumbnail, planMinimum: content.planMinimum, tmdbId: content.tmdbId, imdbId: content.imdbId }).from(content).where(and(eq(content.isActive, true), inArray(content.id, ids))).orderBy(desc(content.imdbScore)).limit(limit).offset((page - 1) * limit) : []
  } else {
    rows = await db.select({ id: content.id, title: content.title, type: content.type, releaseYear: content.releaseYear, rating: content.rating, imdbScore: content.imdbScore, durationMins: content.durationMins, s3Thumbnail: content.s3Thumbnail, planMinimum: content.planMinimum, tmdbId: content.tmdbId, imdbId: content.imdbId }).from(content).where(and(...conditions)).orderBy(desc(content.imdbScore)).limit(limit).offset((page - 1) * limit)
  }

  const total = (await db.select({ total: sql<number>`count(*)::int` }).from(content).where(and(...conditions)))[0]?.total ?? 0

  const responseBody = {
    success: true,
    data: rows,
    meta: { requestId: request.id, timestamp: new Date().toISOString(), pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  }
  await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
  return reply.send(responseBody)
}

// ─── Home ────────────────────────────────────────────────────────────────────

export async function getGenreRowsHandler(request: FastifyRequest, reply: FastifyReply) {
  const cacheKey = 'browse:home'
  const cached = await redis.get(cacheKey)
  if (cached) return reply.send(JSON.parse(cached))

  // TMDB-backed home page
  if (hasTmdb()) {
    try {
      const client = tmdb()
      const [trendingPage, moviesPage, tvPage] = await Promise.all([
        client.trending('all'),
        client.popularMovies(),
        client.popularTv(),
      ])

      const toSummary = (i: (typeof trendingPage.results)[0]) => ({
        id: tmdbContentId(tmdbType(i) === 'series' ? 'tv' : 'movie', i.id),
        title: tmdbTitle(i),
        type: tmdbType(i),
        releaseYear: tmdbYear(i),
        rating: null,
        imdbScore: i.vote_average > 0 ? i.vote_average.toFixed(1) : null,
        durationMins: null,
        s3Thumbnail: posterUrl(i.poster_path),
        backdropUrl: backdropUrl(i.backdrop_path),
        planMinimum: 'basic',
        tmdbId: i.id,
        imdbId: null,
      })

      const trending = trendingPage.results.filter(i => i.media_type !== 'person').slice(0, 20).map(toSummary)
      const featured = trending[0] ?? null

      if (featured && featured.tmdbId) {
        try {
          const videoRes = featured.type === 'movie'
            ? await client.getMovieVideos(featured.tmdbId)
            : await client.getTvVideos(featured.tmdbId)
          const trailer = findBestTrailer(videoRes.results as any)
          if (trailer) {
            (featured as any).trailerKey = trailer.key
          }
        } catch {
          // ignore
        }
      }

      // Genre rows from TMDB genre IDs
      const FEATURED_GENRE_IDS = [
        { name: 'Action', id: 28, tv: 10759 },
        { name: 'Sci-Fi', id: 878, tv: 10765 },
        { name: 'Crime', id: 80, tv: 80 },
        { name: 'Drama', id: 18, tv: 18 },
        { name: 'Comedy', id: 35, tv: 35 },
        { name: 'Horror', id: 27, tv: 27 },
        { name: 'Fantasy', id: 14, tv: 14 },
        { name: 'Thriller', id: 53, tv: 53 },
        { name: 'Animation', id: 16, tv: 16 },
        { name: 'Documentary', id: 99, tv: 99 },
        { name: 'Romance', id: 10749, tv: 10749 },
        { name: 'Mystery', id: 9648, tv: 9648 },
      ]

      const rows = await Promise.all(
        FEATURED_GENRE_IDS.map(async (g) => {
          try {
            const [moviePage, tvPage] = await Promise.all([
              client.discoverMovie(g.id),
              client.discoverTv(g.tv),
            ])
            const items = [
              ...moviePage.results.slice(0, 10),
              ...tvPage.results.slice(0, 10),
            ]
              .sort((a, b) => b.vote_average - a.vote_average)
              .slice(0, 20)
              .map(toSummary)

            const slug = TMDB_GENRE_MAP[g.id] ?? g.name.toLowerCase()
            return {
              genre: { id: `tmdb-genre-${g.id}`, name: g.name, slug },
              items,
            }
          } catch {
            return null
          }
        })
      )

      const validRows = rows.filter((r): r is NonNullable<typeof r> => r !== null && r.items.length > 0)

      const responseBody = {
        success: true,
        data: {
          featured,
          trending,
          rows: validRows,
        },
        meta: { requestId: request.id, timestamp: new Date().toISOString() },
      }
      await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
      return reply.send(responseBody)
    } catch (e) {
      // fall through to local DB
    }
  }

  // Local DB fallback
  const allGenres = await db.select().from(genres).orderBy(genres.name)
  const localRows = await Promise.all(
    allGenres.map(async (g) => {
      const ids = (await db.select({ contentId: contentGenres.contentId }).from(contentGenres).where(eq(contentGenres.genreId, g.id)).limit(20)).map(r => r.contentId)
      if (!ids.length) return { genre: g, items: [] }
      const items = await db.select({ id: content.id, title: content.title, type: content.type, releaseYear: content.releaseYear, rating: content.rating, imdbScore: content.imdbScore, durationMins: content.durationMins, s3Thumbnail: content.s3Thumbnail, planMinimum: content.planMinimum, tmdbId: content.tmdbId, imdbId: content.imdbId }).from(content).where(and(eq(content.isActive, true), inArray(content.id, ids))).orderBy(desc(content.imdbScore)).limit(20)
      return { genre: g, items }
    })
  )

  const featured = (await db.select().from(content).where(eq(content.isActive, true)).orderBy(desc(content.imdbScore)).limit(1))[0] ?? null
  if (featured && featured.tmdbId && hasTmdb()) {
    try {
      const client = tmdb()
      const videoRes = featured.type === 'movie'
        ? await client.getMovieVideos(featured.tmdbId)
        : await client.getTvVideos(featured.tmdbId)
      const trailer = findBestTrailer(videoRes.results as any)
      if (trailer) {
        (featured as any).trailerKey = trailer.key
      }
    } catch {
      // ignore
    }
  }

  const responseBody = {
    success: true,
    data: { featured, trending: [], rows: localRows.filter(r => r.items.length > 0) },
    meta: { requestId: request.id, timestamp: new Date().toISOString() },
  }
  await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
  return reply.send(responseBody)
}

// ─── Trending ────────────────────────────────────────────────────────────────

export async function getTrendingHandler(request: FastifyRequest, reply: FastifyReply) {
  const cacheKey = 'trending:global'
  const cached = await redis.get(cacheKey)
  if (cached) return reply.send(JSON.parse(cached))

  if (hasTmdb()) {
    try {
      const page = await tmdb().trending('all')
      const rows = page.results
        .filter(i => i.media_type !== 'person')
        .slice(0, 20)
        .map(i => ({
          id: tmdbContentId(tmdbType(i) === 'series' ? 'tv' : 'movie', i.id),
          title: tmdbTitle(i),
          type: tmdbType(i),
          releaseYear: tmdbYear(i),
          rating: null,
          imdbScore: i.vote_average > 0 ? i.vote_average.toFixed(1) : null,
          durationMins: null,
          s3Thumbnail: posterUrl(i.poster_path),
          backdropUrl: backdropUrl(i.backdrop_path),
          planMinimum: 'basic',
          tmdbId: i.id,
          imdbId: null,
        }))

      const responseBody = { success: true, data: rows, meta: { requestId: request.id, timestamp: new Date().toISOString() } }
      await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
      return reply.send(responseBody)
    } catch { /* fall through */ }
  }

  const rows = await db.select({ id: content.id, title: content.title, type: content.type, releaseYear: content.releaseYear, rating: content.rating, imdbScore: content.imdbScore, durationMins: content.durationMins, s3Thumbnail: content.s3Thumbnail, planMinimum: content.planMinimum, tmdbId: content.tmdbId, imdbId: content.imdbId }).from(content).where(eq(content.isActive, true)).orderBy(desc(content.imdbScore)).limit(20)
  const responseBody = { success: true, data: rows, meta: { requestId: request.id, timestamp: new Date().toISOString() } }
  await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
  return reply.send(responseBody)
}
