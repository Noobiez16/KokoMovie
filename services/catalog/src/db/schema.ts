import { pgSchema, uuid, text, smallint, numeric, timestamp, boolean, integer, primaryKey } from 'drizzle-orm/pg-core'

export const catalogSchema = pgSchema('catalog')

export const content = catalogSchema.table('content', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  type: text('type').notNull(), // 'movie' | 'series'
  description: text('description'),
  releaseYear: smallint('release_year'),
  rating: text('rating'), // 'G' | 'PG' | 'PG-13' | 'R' | 'TV-MA'
  imdbScore: numeric('imdb_score', { precision: 3, scale: 1 }),
  durationMins: smallint('duration_mins'), // null for series
  s3Thumbnail: text('s3_thumbnail'),
  s3TrailerKey: text('s3_trailer_key'),
  s3HlsKey: text('s3_hls_key'),
  tmdbId: integer('tmdb_id'),
  imdbId: text('imdb_id'),
  backdropUrl: text('backdrop_url'),
  drmKeyId: uuid('drm_key_id'),
  planMinimum: text('plan_minimum').default('basic'),
  introStartSecs: integer('intro_start_secs'),
  introEndSecs: integer('intro_end_secs'),
  creditsStartSecs: integer('credits_start_secs'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const genres = catalogSchema.table('genres', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
})

export const contentGenres = catalogSchema.table('content_genres', {
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  genreId: uuid('genre_id').notNull().references(() => genres.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.contentId, t.genreId] }),
}))

export const castMembers = catalogSchema.table('cast_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  photoUrl: text('photo_url'),
  bio: text('bio'),
})

export const contentCast = catalogSchema.table('content_cast', {
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  castMemberId: uuid('cast_member_id').notNull().references(() => castMembers.id, { onDelete: 'cascade' }),
  role: text('role'), // character name
  order: integer('order').default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.contentId, t.castMemberId] }),
}))

export const seasons = catalogSchema.table('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  seasonNumber: smallint('season_number').notNull(),
  title: text('title'),
  overview: text('overview'),
  airDate: text('air_date'),
})

export const episodes = catalogSchema.table('episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonId: uuid('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  episodeNumber: smallint('episode_number').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  durationMins: smallint('duration_mins'),
  s3HlsKey: text('s3_hls_key'),
  s3ThumbnailKey: text('s3_thumbnail_key'),
  introStartSecs: integer('intro_start_secs'),
  introEndSecs: integer('intro_end_secs'),
  creditsStartSecs: integer('credits_start_secs'),
  airDate: text('air_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
