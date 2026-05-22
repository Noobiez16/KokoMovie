import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = join(app.getPath('userData'), 'kokomovie.db')
    _db = new Database(dbPath)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    migrate(_db)
  }
  return _db
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id              TEXT PRIMARY KEY,
      content_id      TEXT NOT NULL,
      episode_id      TEXT,
      title           TEXT NOT NULL,
      content_type    TEXT NOT NULL DEFAULT 'movie',
      thumbnail_url   TEXT,
      duration_mins   INTEGER,
      s3_hls_key      TEXT NOT NULL,
      drm_key_id      TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',
      progress_percent INTEGER NOT NULL DEFAULT 0,
      download_speed_kbps INTEGER DEFAULT 0,
      total_segments  INTEGER DEFAULT 0,
      completed_segments INTEGER DEFAULT 0,
      local_dir       TEXT NOT NULL,
      manifest_path   TEXT,
      downloaded_at   TEXT,
      expires_at      TEXT NOT NULL,
      error_message   TEXT,
      headers         TEXT
    );

    CREATE INDEX IF NOT EXISTS downloads_content_id_idx ON downloads (content_id);
    CREATE INDEX IF NOT EXISTS downloads_status_idx ON downloads (status);
    CREATE INDEX IF NOT EXISTS downloads_expires_at_idx ON downloads (expires_at);
  `)

  // Check if headers column exists in downloads table (for backward compatibility)
  const tableInfo = db.prepare("PRAGMA table_info(downloads)").all() as Array<{ name: string }>
  const hasHeaders = tableInfo.some((col) => col.name === 'headers')
  if (!hasHeaders) {
    db.exec(`ALTER TABLE downloads ADD COLUMN headers TEXT;`)
  }
}

export interface DownloadRow {
  id: string
  content_id: string
  episode_id: string | null
  title: string
  content_type: string
  thumbnail_url: string | null
  duration_mins: number | null
  s3_hls_key: string
  drm_key_id: string | null
  status: string
  progress_percent: number
  download_speed_kbps: number
  total_segments: number
  completed_segments: number
  local_dir: string
  manifest_path: string | null
  downloaded_at: string | null
  expires_at: string
  error_message: string | null
  headers: string | null
}
