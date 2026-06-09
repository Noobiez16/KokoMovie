import { ipcMain } from 'electron'
import { getDb } from '../db/sqlite'

// Fully-local library: watchlist, resume positions / continue-watching, and
// preferences. Stores only ids + positions; the renderer enriches titles and
// artwork from TMDB on read.

export interface WatchlistRow {
  content_id: string
  content_type: string
  added_at: string
}

export interface PositionRow {
  content_id: string
  episode_id: string
  content_type: string
  position_seconds: number
  duration_seconds: number
  completed_at: string | null
  updated_at: string
}

export interface PreferencesRow {
  language: string
  subtitle_default: string | null
  autoplay: number
  maturity_rating: string
}

export function registerLibraryIpc(): void {
  const db = getDb()

  // ─── Watchlist ───────────────────────────────────────────────────────────
  ipcMain.handle('library:watchlist:list', () =>
    db.prepare('SELECT * FROM watchlist ORDER BY added_at DESC').all() as WatchlistRow[],
  )

  ipcMain.handle('library:watchlist:add', (_e, contentId: string, contentType: string) => {
    db.prepare(
      `INSERT INTO watchlist (content_id, content_type, added_at) VALUES (?, ?, ?)
       ON CONFLICT(content_id) DO UPDATE SET content_type = excluded.content_type`,
    ).run(contentId, contentType || 'movie', new Date().toISOString())
    return { ok: true }
  })

  ipcMain.handle('library:watchlist:remove', (_e, contentId: string) => {
    db.prepare('DELETE FROM watchlist WHERE content_id = ?').run(contentId)
    return { ok: true }
  })

  ipcMain.handle('library:watchlist:has', (_e, contentId: string) => {
    const row = db.prepare('SELECT 1 FROM watchlist WHERE content_id = ?').get(contentId)
    return { inWatchlist: !!row }
  })

  // ─── Playback positions / continue-watching ──────────────────────────────
  ipcMain.handle(
    'library:position:save',
    (_e, p: { contentId: string; episodeId?: string | null; contentType?: string; positionSeconds: number; durationSeconds: number; completed?: boolean }) => {
      const episodeId = p.episodeId ?? ''
      const completedAt = p.completed ? new Date().toISOString() : null
      db.prepare(
        `INSERT INTO playback_positions
           (content_id, episode_id, content_type, position_seconds, duration_seconds, completed_at, updated_at)
         VALUES (@content_id, @episode_id, @content_type, @position_seconds, @duration_seconds, @completed_at, @updated_at)
         ON CONFLICT(content_id, episode_id) DO UPDATE SET
           position_seconds = excluded.position_seconds,
           duration_seconds = excluded.duration_seconds,
           completed_at     = excluded.completed_at,
           updated_at       = excluded.updated_at`,
      ).run({
        content_id: p.contentId,
        episode_id: episodeId,
        content_type: p.contentType ?? 'movie',
        position_seconds: Math.floor(p.positionSeconds),
        duration_seconds: Math.floor(p.durationSeconds),
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      })
      return { ok: true }
    },
  )

  ipcMain.handle('library:position:get', (_e, contentId: string, episodeId?: string | null) => {
    return (
      (db
        .prepare('SELECT * FROM playback_positions WHERE content_id = ? AND episode_id = ?')
        .get(contentId, episodeId ?? '') as PositionRow | undefined) ?? null
    )
  })

  // All positions, newest first (used for both continue-watching and history).
  ipcMain.handle('library:position:list', () =>
    db.prepare('SELECT * FROM playback_positions ORDER BY updated_at DESC LIMIT 200').all() as PositionRow[],
  )

  ipcMain.handle('library:position:delete', (_e, contentId: string, episodeId?: string | null) => {
    db.prepare('DELETE FROM playback_positions WHERE content_id = ? AND episode_id = ?').run(contentId, episodeId ?? '')
    return { ok: true }
  })

  // Remove a whole title from Continue Watching: delete every IN-PROGRESS position row for
  // the content (across episodes). Completed rows are kept so finished episodes still show in
  // Viewing History — only the in-progress records are cleared from CW and History-In-Progress.
  ipcMain.handle('library:position:delete-content', (_e, contentId: string) => {
    db.prepare('DELETE FROM playback_positions WHERE content_id = ? AND completed_at IS NULL').run(contentId)
    return { ok: true }
  })

  // ─── Preferences ─────────────────────────────────────────────────────────
  ipcMain.handle('library:prefs:get', () =>
    db.prepare('SELECT language, subtitle_default, autoplay, maturity_rating FROM preferences WHERE id = 1').get() as PreferencesRow,
  )

  ipcMain.handle(
    'library:prefs:set',
    (_e, p: { language?: string; subtitleDefault?: string | null; autoplay?: boolean; maturityRating?: string }) => {
      const current = db.prepare('SELECT language, subtitle_default, autoplay, maturity_rating FROM preferences WHERE id = 1').get() as PreferencesRow
      db.prepare(
        `UPDATE preferences SET language = ?, subtitle_default = ?, autoplay = ?, maturity_rating = ? WHERE id = 1`,
      ).run(
        p.language ?? current.language,
        p.subtitleDefault !== undefined ? p.subtitleDefault : current.subtitle_default,
        p.autoplay !== undefined ? (p.autoplay ? 1 : 0) : current.autoplay,
        p.maturityRating ?? current.maturity_rating,
      )
      return db.prepare('SELECT language, subtitle_default, autoplay, maturity_rating FROM preferences WHERE id = 1').get() as PreferencesRow
    },
  )
}
