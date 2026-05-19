import { pgSchema, uuid, text, boolean, timestamp, index, uniqueIndex, smallint } from 'drizzle-orm/pg-core'

export const userSchema = pgSchema('user')

export const profiles = userSchema.table(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    isKids: boolean('is_kids').notNull().default(false),
    maturityRating: text('maturity_rating').notNull().default('TV-MA'),
    language: text('language').notNull().default('en-US'),
    autoplay: boolean('autoplay').notNull().default(true),
    subtitleDefault: text('subtitle_default'),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('profiles_account_id_idx').on(t.accountId),
  ],
)

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
