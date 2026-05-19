-- Auth schema initial migration
CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS auth.accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT,
  google_id       TEXT,
  apple_id        TEXT,
  mfa_secret      TEXT,
  mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_backup_codes TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS accounts_google_id_idx ON auth.accounts (google_id);
CREATE INDEX IF NOT EXISTS accounts_apple_id_idx ON auth.accounts (apple_id);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES auth.accounts(id) ON DELETE CASCADE,
  token_hash        TEXT UNIQUE NOT NULL,
  device_session_id UUID,
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_account_id_idx ON auth.refresh_tokens (account_id);

CREATE TABLE IF NOT EXISTS auth.device_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES auth.accounts(id) ON DELETE CASCADE,
  device_name     TEXT NOT NULL,
  platform        TEXT NOT NULL,
  ip_address_hash TEXT NOT NULL,
  user_agent      TEXT,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS device_sessions_account_id_idx ON auth.device_sessions (account_id);
