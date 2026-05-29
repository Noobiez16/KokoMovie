import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { db } from '../db/connection.js'
import { content, genres, contentGenres } from '../db/schema.js'
import { redis } from '../redis/client.js'
import { eq, and, inArray, desc, sql } from 'drizzle-orm'
import { createTmdbClient, tmdbContentId, posterUrl, backdropUrl, tmdbTitle, tmdbType, tmdbYear, TMDB_GENRE_MAP } from '../lib/tmdb.js'
import { syncTrending, syncPopular } from '../lib/tmdb-sync.js'
import { createHash } from 'crypto'
import { config } from '../config.js'

const browseQuerySchema = z.object({
  genre: z.string().optional(),
  type: z.enum(['movie', 'series']).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

function getTmdbKey(request?: FastifyRequest): string {
  const headerKey = request?.headers['x-tmdb-key'] as string | undefined
  return headerKey?.trim() || ''
}

function getCacheKey(base: string, request: FastifyRequest, queryData: unknown): string {
  const tmdbKey = getTmdbKey(request)
  if (tmdbKey) {
    const hash = createHash('sha256').update(tmdbKey).digest('hex').slice(0, 16)
    return `${base}:tmdb:${hash}:${JSON.stringify(queryData)}`
  }
  return `${base}:local:${JSON.stringify(queryData)}`
}


function hasTmdb(request?: FastifyRequest): boolean {
  return getTmdbKey(request).length > 0
}

function tmdb(request?: FastifyRequest) {
  return createTmdbClient(getTmdbKey(request))
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
  const cacheKey = getCacheKey('browse', request, parsed.data)
  const cached = await redis.get(cacheKey)
  if (cached) return reply.send(JSON.parse(cached))

  // If TMDB key is set, retrieve from TMDB to show a giant catalog
  if (hasTmdb(request)) {
    try {
      const client = tmdb(request)
      const toSummary = (i: any) => ({
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

      if (genre === 'trending') {
        const offset = (page - 1) * limit
        const itemsPerPage = 20
        const startPage = Math.floor(offset / itemsPerPage) + 1
        const endPage = Math.floor((offset + limit - 1) / itemsPerPage) + 1

        const pagePromises = []
        for (let p = startPage; p <= endPage; p++) {
          pagePromises.push(client.trending(type === 'series' ? 'tv' : type === 'movie' ? 'movie' : 'all', p))
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

        const startIdx = offset % itemsPerPage
        const itemsSlice = allItems.slice(startIdx, startIdx + limit)
        const rows = itemsSlice.filter(i => i.media_type !== 'person').map(toSummary)
        const pages = Math.ceil(total / limit)

        const responseBody = {
          success: true,
          data: rows,
          meta: {
            requestId: request.id,
            timestamp: new Date().toISOString(),
            source: 'tmdb' as const,
            pagination: { page, limit, total, pages },
          },
        }
        await redis.setex(cacheKey, 1800, JSON.stringify(responseBody))
        return reply.send(responseBody)
      }

      let genreId: number | undefined
      if (genre) {
        const entry = Object.entries(TMDB_GENRE_MAP).find(([_, slug]) => slug === genre)
        if (entry) {
          genreId = Number(entry[0])
        }
      }

      // Calculate dynamic itemsPerPage (40 for mixed, 20 for movie/series)
      const itemsPerPage = (!type) ? 40 : 20
      const offset = (page - 1) * limit
      const startPage = Math.floor(offset / itemsPerPage) + 1
      const endPage = Math.floor((offset + limit - 1) / itemsPerPage) + 1

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
      const startIdx = offset % itemsPerPage
      const itemsSlice = allItems.slice(startIdx, startIdx + limit)

      const rows = itemsSlice
        .filter(i => i.media_type !== 'person')
        .map(toSummary)

      // Normalize pagination output for UI client
      const pages = Math.ceil(total / limit)

      const responseBody = {
        success: true,
        data: rows,
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
          source: 'tmdb' as const,
          pagination: { page, limit, total, pages },
        },
      }
      await redis.setex(cacheKey, 1800, JSON.stringify(responseBody))
      return reply.send(responseBody)
    } catch (e) {
      request.log.error(e, 'TMDB browse fetch failed — falling back to local DB')
    }
  }

  const conditions = [eq(content.isActive, true)]
  if (type) conditions.push(eq(content.type, type))
  if (year) conditions.push(eq(content.releaseYear, year))

  let rows
  let total
  if (genre) {
    if (genre === 'trending') {
      rows = await db.select({ id: content.id, title: content.title, type: content.type, releaseYear: content.releaseYear, rating: content.rating, imdbScore: content.imdbScore, durationMins: content.durationMins, s3Thumbnail: content.s3Thumbnail, planMinimum: content.planMinimum, tmdbId: content.tmdbId, imdbId: content.imdbId, backdropUrl: content.backdropUrl }).from(content).where(and(...conditions)).orderBy(desc(content.imdbScore)).limit(limit).offset((page - 1) * limit)
      total = (await db.select({ total: sql<number>`count(*)::int` }).from(content).where(and(...conditions)))[0]?.total ?? 0
    } else {
      const [genreRow] = await db.select({ id: genres.id }).from(genres).where(eq(genres.slug, genre)).limit(1)
      if (!genreRow) {
        return reply.code(404).send({
          success: false,
          error: { code: 'CONTENT_NOT_FOUND', message: 'Genre not found' },
          meta: { requestId: request.id, timestamp: new Date().toISOString() },
        })
      }
      const ids = (await db.select({ contentId: contentGenres.contentId }).from(contentGenres).where(eq(contentGenres.genreId, genreRow.id))).map(r => r.contentId)
      rows = ids.length ? await db.select({ id: content.id, title: content.title, type: content.type, releaseYear: content.releaseYear, rating: content.rating, imdbScore: content.imdbScore, durationMins: content.durationMins, s3Thumbnail: content.s3Thumbnail, planMinimum: content.planMinimum, tmdbId: content.tmdbId, imdbId: content.imdbId, backdropUrl: content.backdropUrl }).from(content).where(and(...conditions, inArray(content.id, ids))).orderBy(desc(content.imdbScore)).limit(limit).offset((page - 1) * limit) : []
      total = ids.length ? (await db.select({ total: sql<number>`count(*)::int` }).from(content).where(and(...conditions, inArray(content.id, ids))))[0]?.total ?? 0 : 0
    }
  } else {
    rows = await db.select({ id: content.id, title: content.title, type: content.type, releaseYear: content.releaseYear, rating: content.rating, imdbScore: content.imdbScore, durationMins: content.durationMins, s3Thumbnail: content.s3Thumbnail, planMinimum: content.planMinimum, tmdbId: content.tmdbId, imdbId: content.imdbId, backdropUrl: content.backdropUrl }).from(content).where(and(...conditions)).orderBy(desc(content.imdbScore)).limit(limit).offset((page - 1) * limit)
    total = (await db.select({ total: sql<number>`count(*)::int` }).from(content).where(and(...conditions)))[0]?.total ?? 0
  }

  const responseBody = {
    success: true,
    data: rows,
    meta: { requestId: request.id, timestamp: new Date().toISOString(), source: 'local' as const, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  }
  await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
  return reply.send(responseBody)
}

// ─── Home ────────────────────────────────────────────────────────────────────

export async function getGenreRowsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { type?: 'movie' | 'series' }
  const type = query.type === 'movie' || query.type === 'series' ? query.type : undefined
  const cacheKey = getCacheKey('browse:home', request, { type })
  const cached = await redis.get(cacheKey)
  if (cached) return reply.send(JSON.parse(cached))

  // TMDB-backed home page
  if (hasTmdb(request)) {
    try {
      const client = tmdb(request)
      const toSummary = (i: any) => ({
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

      let trending
      let featured

      if (!type) {
        const [trendingPage, moviesPage, tvPage] = await Promise.all([
          client.trending('all'),
          client.popularMovies(),
          client.popularTv(),
        ])
        trending = trendingPage.results.filter(i => i.media_type !== 'person').slice(0, 20).map(toSummary)
        featured = trending[0] ?? null
      } else {
        const trendingPage = await client.trending(type === 'series' ? 'tv' : 'movie')
        trending = trendingPage.results.filter(i => i.media_type !== 'person').slice(0, 20).map(toSummary)
        featured = trending[0] ?? null
      }

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
            const moviePromise = (!type || type === 'movie') ? client.discoverMovie(g.id) : null
            const tvPromise = (!type || type === 'series') ? client.discoverTv(g.tv) : null
            const [moviePage, tvPage] = await Promise.all([moviePromise, tvPromise])

            const movieItems = moviePage ? moviePage.results.slice(0, type ? 20 : 10) : []
            const tvItems = tvPage ? tvPage.results.slice(0, type ? 20 : 10) : []

            const items = [
              ...movieItems,
              ...tvItems,
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
        meta: { requestId: request.id, timestamp: new Date().toISOString(), source: 'tmdb' as const },
      }
      await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
      return reply.send(responseBody)
    } catch (e) {
      request.log.error(e, 'TMDB getGenreRows failed — falling back to local DB')
    }
  }

  // Local DB fallback
  const localConditions = [eq(content.isActive, true)]
  if (type) localConditions.push(eq(content.type, type))

  const allGenres = await db.select().from(genres).orderBy(genres.name)
  const localRows = await Promise.all(
    allGenres.map(async (g) => {
      const ids = (await db.select({ contentId: contentGenres.contentId }).from(contentGenres).where(eq(contentGenres.genreId, g.id)).limit(20)).map(r => r.contentId)
      if (!ids.length) return { genre: g, items: [] }
      const items = await db.select({
        id: content.id,
        title: content.title,
        type: content.type,
        releaseYear: content.releaseYear,
        rating: content.rating,
        imdbScore: content.imdbScore,
        durationMins: content.durationMins,
        s3Thumbnail: content.s3Thumbnail,
        planMinimum: content.planMinimum,
        tmdbId: content.tmdbId,
        imdbId: content.imdbId,
        backdropUrl: content.backdropUrl
      }).from(content).where(and(...localConditions, inArray(content.id, ids))).orderBy(desc(content.imdbScore)).limit(20)
      return { genre: g, items }
    })
  )

  const featured = (await db.select().from(content).where(and(...localConditions)).orderBy(desc(content.imdbScore)).limit(1))[0] ?? null
  
  if (featured) {
    const featuredGenres = await db
      .select({ id: genres.id, name: genres.name, slug: genres.slug })
      .from(genres)
      .innerJoin(contentGenres, eq(genres.id, contentGenres.genreId))
      .where(eq(contentGenres.contentId, featured.id))
    
    ;(featured as any).genres = featuredGenres

    if (featured.tmdbId) {
      const tmdbKeyToUse = getTmdbKey(request) || config.TMDB_API_KEY
      if (tmdbKeyToUse) {
        try {
          const client = createTmdbClient(tmdbKeyToUse)
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
    }
  }

  const trending = await db.select({
    id: content.id,
    title: content.title,
    type: content.type,
    releaseYear: content.releaseYear,
    rating: content.rating,
    imdbScore: content.imdbScore,
    durationMins: content.durationMins,
    s3Thumbnail: content.s3Thumbnail,
    planMinimum: content.planMinimum,
    tmdbId: content.tmdbId,
    imdbId: content.imdbId,
    backdropUrl: content.backdropUrl
  }).from(content).where(and(...localConditions)).orderBy(desc(content.imdbScore)).limit(20)

  const responseBody = {
    success: true,
    data: { featured, trending, rows: localRows.filter(r => r.items.length > 0) },
    meta: { requestId: request.id, timestamp: new Date().toISOString(), source: 'local' as const },
  }
  await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
  return reply.send(responseBody)
}

// ─── Trending ────────────────────────────────────────────────────────────────

export async function getTrendingHandler(request: FastifyRequest, reply: FastifyReply) {
  const cacheKey = getCacheKey('trending:global', request, {})
  const cached = await redis.get(cacheKey)
  if (cached) return reply.send(JSON.parse(cached))

  if (hasTmdb(request)) {
    try {
      const page = await tmdb(request).trending('all')
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

      const responseBody = { success: true, data: rows, meta: { requestId: request.id, timestamp: new Date().toISOString(), source: 'tmdb' as const } }
      await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
      return reply.send(responseBody)
    } catch (e) {
      request.log.error(e, 'TMDB getTrending failed — falling back to local DB')
    }
  }

  const rows = await db.select({ id: content.id, title: content.title, type: content.type, releaseYear: content.releaseYear, rating: content.rating, imdbScore: content.imdbScore, durationMins: content.durationMins, s3Thumbnail: content.s3Thumbnail, planMinimum: content.planMinimum, tmdbId: content.tmdbId, imdbId: content.imdbId, backdropUrl: content.backdropUrl }).from(content).where(eq(content.isActive, true)).orderBy(desc(content.imdbScore)).limit(20)
  const responseBody = { success: true, data: rows, meta: { requestId: request.id, timestamp: new Date().toISOString(), source: 'local' as const } }
  await redis.setex(cacheKey, 3600, JSON.stringify(responseBody))
  return reply.send(responseBody)
}
