import { pgSchema, uuid, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

export const authSchema = pgSchema('auth')

export const accounts = authSchema.table(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    googleId: text('google_id'),
    appleId: text('apple_id'),
    mfaSecret: text('mfa_secret'),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaBackupCodes: text('mfa_backup_codes').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('accounts_email_unique').on(t.email),
    index('accounts_google_id_idx').on(t.googleId),
    index('accounts_apple_id_idx').on(t.appleId),
  ],
)

export const refreshTokens = authSchema.table(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    deviceSessionId: uuid('device_session_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('refresh_tokens_account_id_idx').on(t.accountId),
    uniqueIndex('refresh_tokens_token_hash_unique').on(t.tokenHash),
  ],
)

export const deviceSessions = authSchema.table(
  'device_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    deviceName: text('device_name').notNull(),
    platform: text('platform').notNull(),
    ipAddressHash: text('ip_address_hash').notNull(),
    userAgent: text('user_agent'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('device_sessions_account_id_idx').on(t.accountId),
  ],
)

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type RefreshToken = typeof refreshTokens.$inferSelect
export type NewRefreshToken = typeof refreshTokens.$inferInsert
export type DeviceSession = typeof deviceSessions.$inferSelect
export type NewDeviceSession = typeof deviceSessions.$inferInsert
