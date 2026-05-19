-- User schema initial migration
CREATE SCHEMA IF NOT EXISTS "user";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "user".profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL,
  name            TEXT NOT NULL,
  avatar_url      TEXT,
  is_kids         BOOLEAN NOT NULL DEFAULT FALSE,
  maturity_rating TEXT NOT NULL DEFAULT 'TV-MA',
  language        TEXT NOT NULL DEFAULT 'en-US',
  autoplay        BOOLEAN NOT NULL DEFAULT TRUE,
  subtitle_default TEXT,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS profiles_account_id_idx ON "user".profiles (account_id);
