import { db } from '../db/connection.js'
import { content, genres, contentGenres, castMembers, contentCast, seasons, episodes } from '../db/schema.js'
import {
  createTmdbClient, posterUrl, backdropUrl, tmdbTitle, tmdbType, tmdbYear,
  tmdbContentId, TMDB_GENRE_MAP,
  type TmdbItem, type TmdbMovieDetail, type TmdbTvDetail,
} from './tmdb.js'
import { eq, and } from 'drizzle-orm'

type TmdbClient = ReturnType<typeof createTmdbClient>

// Convert a TMDB item to a content row and upsert it. Returns the stable UUID.
async function upsertContentFromItem(item: TmdbItem): Promise<string | null> {
  const type = tmdbType(item)
  if (type !== 'movie' && type !== 'series') return null
  const tmdbType_ = type === 'series' ? 'tv' : 'movie'
  
  // Reuse existing ID if already synced under a different ID (e.g. seeds)
  const [existing] = await db.select({ id: content.id }).from(content).where(eq(content.tmdbId, item.id)).limit(1)
  const id = existing?.id ?? tmdbContentId(tmdbType_, item.id)

  await db.insert(content).values({
    id,
    title: tmdbTitle(item),
    type,
    description: item.overview ?? null,
    releaseYear: tmdbYear(item) as unknown as number ?? null,
    imdbScore: item.vote_average > 0 ? item.vote_average.toFixed(1) : null,
    s3Thumbnail: posterUrl(item.poster_path),
    backdropUrl: backdropUrl(item.backdrop_path),
    planMinimum: 'basic',
    isActive: true,
    tmdbId: item.id,
  }).onConflictDoUpdate({
    target: content.id,
    set: {
      title: tmdbTitle(item),
      description: item.overview ?? null,
      s3Thumbnail: posterUrl(item.poster_path),
      backdropUrl: backdropUrl(item.backdrop_path),
      imdbScore: item.vote_average > 0 ? item.vote_average.toFixed(1) : null,
      isActive: true,
    },
  })

  // Genre links from genre_ids
  if (item.genre_ids?.length) {
    for (const tmdbGenreId of item.genre_ids) {
      const slug = TMDB_GENRE_MAP[tmdbGenreId]
      if (!slug) continue
      const [g] = await db.select({ id: genres.id }).from(genres).where(eq(genres.slug, slug)).limit(1)
      if (g) {
        await db.insert(contentGenres).values({ contentId: id, genreId: g.id }).onConflictDoNothing()
      }
    }
  }

  return id
}

// Full sync of a movie (including cast, imdb_id)
async function syncMovie(tmdb: TmdbClient, tmdbId: number) {
  const movie = await tmdb.getMovie(tmdbId)
  
  // Reuse existing ID if already synced under a different ID (e.g. seeds)
  const [existing] = await db.select({ id: content.id }).from(content).where(eq(content.tmdbId, tmdbId)).limit(1)
  const id = existing?.id ?? tmdbContentId('movie', tmdbId)

  await db.insert(content).values({
    id,
    title: movie.title ?? 'Unknown',
    type: 'movie',
    description: movie.overview ?? null,
    releaseYear: movie.release_date ? parseInt(movie.release_date.slice(0, 4)) as unknown as number : null,
    imdbScore: movie.vote_average > 0 ? movie.vote_average.toFixed(1) : null,
    durationMins: movie.runtime as unknown as number ?? null,
    s3Thumbnail: posterUrl(movie.poster_path),
    backdropUrl: backdropUrl(movie.backdrop_path),
    planMinimum: 'basic',
    isActive: true,
    tmdbId: tmdbId,
    imdbId: movie.external_ids?.imdb_id ?? null,
  }).onConflictDoUpdate({
    target: content.id,
    set: {
      title: movie.title ?? 'Unknown',
      description: movie.overview ?? null,
      imdbScore: movie.vote_average > 0 ? movie.vote_average.toFixed(1) : null,
      durationMins: movie.runtime as unknown as number ?? null,
      s3Thumbnail: posterUrl(movie.poster_path),
      backdropUrl: backdropUrl(movie.backdrop_path),
      imdbId: movie.external_ids?.imdb_id ?? null,
      isActive: true,
    },
  })

  // Genres
  for (const g of movie.genres ?? []) {
    const slug = TMDB_GENRE_MAP[g.id]
    if (!slug) continue
    const [row] = await db.select({ id: genres.id }).from(genres).where(eq(genres.slug, slug)).limit(1)
    if (row) await db.insert(contentGenres).values({ contentId: id, genreId: row.id }).onConflictDoNothing()
  }

  // Cast (top 10)
  for (const member of (movie.credits?.cast ?? []).slice(0, 10)) {
    let [cm] = await db.select({ id: castMembers.id }).from(castMembers).where(eq(castMembers.name, member.name)).limit(1)
    if (!cm) {
      const [inserted] = await db.insert(castMembers).values({
        name: member.name,
        photoUrl: member.profile_path ? `https://image.tmdb.org/t/p/w200${member.profile_path}` : null,
      }).returning({ id: castMembers.id })
      cm = inserted!
    }
    if (cm) {
      await db.insert(contentCast).values({
        contentId: id, castMemberId: cm.id, role: member.character, order: member.order,
      }).onConflictDoNothing()
    }
  }

  return id
}

// Full sync of a TV show
async function syncTv(tmdb: TmdbClient, tmdbId: number) {
  const tv = await tmdb.getTv(tmdbId)

  // Reuse existing ID if already synced under a different ID (e.g. seeds)
  const [existing] = await db.select({ id: content.id }).from(content).where(eq(content.tmdbId, tmdbId)).limit(1)
  const id = existing?.id ?? tmdbContentId('tv', tmdbId)

  await db.insert(content).values({
    id,
    title: tv.name ?? 'Unknown',
    type: 'series',
    description: tv.overview ?? null,
    releaseYear: tv.first_air_date ? parseInt(tv.first_air_date.slice(0, 4)) as unknown as number : null,
    imdbScore: tv.vote_average > 0 ? tv.vote_average.toFixed(1) : null,
    s3Thumbnail: posterUrl(tv.poster_path),
    backdropUrl: backdropUrl(tv.backdrop_path),
    planMinimum: 'basic',
    isActive: true,
    tmdbId: tmdbId,
    imdbId: tv.external_ids?.imdb_id ?? null,
  }).onConflictDoUpdate({
    target: content.id,
    set: {
      title: tv.name ?? 'Unknown',
      description: tv.overview ?? null,
      imdbScore: tv.vote_average > 0 ? tv.vote_average.toFixed(1) : null,
      s3Thumbnail: posterUrl(tv.poster_path),
      backdropUrl: backdropUrl(tv.backdrop_path),
      imdbId: tv.external_ids?.imdb_id ?? null,
      isActive: true,
    },
  })

  // Genres
  for (const g of tv.genres ?? []) {
    const slug = TMDB_GENRE_MAP[g.id]
    if (!slug) continue
    const [row] = await db.select({ id: genres.id }).from(genres).where(eq(genres.slug, slug)).limit(1)
    if (row) await db.insert(contentGenres).values({ contentId: id, genreId: row.id }).onConflictDoNothing()
  }

  // Cast (top 10)
  for (const member of (tv.credits?.cast ?? []).slice(0, 10)) {
    let [cm] = await db.select({ id: castMembers.id }).from(castMembers).where(eq(castMembers.name, member.name)).limit(1)
    if (!cm) {
      const [inserted] = await db.insert(castMembers).values({
        name: member.name,
        photoUrl: member.profile_path ? `https://image.tmdb.org/t/p/w200${member.profile_path}` : null,
      }).returning({ id: castMembers.id })
      cm = inserted!
    }
    if (cm) {
      await db.insert(contentCast).values({
        contentId: id, castMemberId: cm.id, role: member.character, order: member.order,
      }).onConflictDoNothing()
    }
  }

  // Seasons (up to 8, skip season 0 "Specials") — sync episodes for every season
  const mainSeasons = (tv.seasons ?? []).filter(s => s.season_number > 0).slice(0, 8)
  for (const s of mainSeasons) {
    let [existingSeason] = await db.select({ id: seasons.id }).from(seasons)
      .where(and(eq(seasons.contentId, id), eq(seasons.seasonNumber, s.season_number as unknown as number)))
      .limit(1)

    if (!existingSeason) {
      const [inserted] = await db.insert(seasons).values({
        contentId: id,
        seasonNumber: s.season_number as unknown as number,
        title: s.name ?? null,
        overview: s.overview ?? null,
        airDate: s.air_date ?? null,
      }).returning({ id: seasons.id })
      existingSeason = inserted!
    }

    if (!existingSeason) continue

    try {
      const seasonDetail = await tmdb.getSeason(tmdbId, s.season_number)
      for (const ep of seasonDetail.episodes ?? []) {
        const [existingEp] = await db.select({ id: episodes.id }).from(episodes)
          .where(and(
            eq(episodes.seasonId, existingSeason.id),
            eq(episodes.episodeNumber, ep.episode_number as unknown as number)
          ))
          .limit(1)

        if (existingEp) {
          await db.update(episodes).set({
            title: ep.name ?? `Episode ${ep.episode_number}`,
            description: ep.overview ?? null,
            durationMins: ep.runtime as unknown as number ?? null,
            s3ThumbnailKey: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
            airDate: ep.air_date ?? null,
          }).where(eq(episodes.id, existingEp.id))
        } else {
          await db.insert(episodes).values({
            seasonId: existingSeason.id,
            contentId: id,
            episodeNumber: ep.episode_number as unknown as number,
            title: ep.name ?? `Episode ${ep.episode_number}`,
            description: ep.overview ?? null,
            durationMins: ep.runtime as unknown as number ?? null,
            s3ThumbnailKey: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
            airDate: ep.air_date ?? null,
          })
        }
      }
    } catch {
      // Season detail fetch failed — season row exists, episodes will be empty
    }
  }

  return id
}

// Sync trending content from TMDB to local DB
export async function syncTrending(tmdb: TmdbClient) {
  const page = await tmdb.trending('all')
  for (const item of page.results) {
    if (item.media_type === 'person') continue
    try {
      await upsertContentFromItem(item)
    } catch {
      // skip individual failures
    }
  }
}

// Fetch full details for a content item by UUID (looks up tmdb_id from DB, then fetches TMDB)
export async function syncContentDetail(tmdb: TmdbClient, contentId: string) {
  const [row] = await db.select({ tmdbId: content.tmdbId, type: content.type })
    .from(content).where(eq(content.id, contentId)).limit(1)
  if (!row?.tmdbId) return

  if (row.type === 'movie') {
    await syncMovie(tmdb, row.tmdbId)
  } else {
    await syncTv(tmdb, row.tmdbId)
  }
}

// Sync popular movies + TV for initial catalog population
export async function syncPopular(tmdb: TmdbClient) {
  const [movies, tv] = await Promise.all([tmdb.popularMovies(), tmdb.popularTv()])
  for (const item of [...movies.results, ...tv.results]) {
    try { await upsertContentFromItem(item) } catch { /* skip */ }
  }
}

export { syncMovie, syncTv }
