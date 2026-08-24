import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs'
import { basename, join } from 'path'
import { z } from 'zod'
import { getDb } from '../db/sqlite.js'
import type { PositionRow, PreferencesRow, WatchlistRow } from './library.js'
import { trustedIpcHandler } from './security.js'
import {
  incomingWins,
  hasValidArtworkSignature,
  libraryExportSchema,
  positionKey,
  type LibraryExportPayload,
  type LibraryImportPreview,
} from '../library-portability.js'

const MAX_IMPORT_BYTES = 75 * 1024 * 1024
const MAX_ARTWORK_BYTES = 50 * 1024 * 1024
const importApplySchema = z.object({
  token: z.string().uuid(),
  mode: z.enum(['merge', 'replace']),
}).strict()

interface PendingImport {
  payload: LibraryExportPayload
  preview: LibraryImportPreview
  expiresAt: number
}

const pendingImports = new Map<string, PendingImport>()

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

function collectArtwork(): LibraryExportPayload['artwork'] {
  const root = join(app.getPath('userData'), 'catalog-artwork', 'v1')
  if (!existsSync(root)) return undefined
  const artwork: NonNullable<LibraryExportPayload['artwork']> = []
  let bytes = 0
  for (const file of readdirSync(root).sort()) {
    if (!/^[a-f0-9]{64}\.(?:jpg|jpeg|png|webp)$/.test(file)) continue
    const path = join(root, file)
    const size = statSync(path).size
    if (size <= 0 || size > 15 * 1024 * 1024 || bytes + size > MAX_ARTWORK_BYTES) continue
    artwork.push({ file, data: readFileSync(path).toString('base64') })
    bytes += size
    if (artwork.length >= 256) break
  }
  return artwork.length > 0 ? artwork : undefined
}

export function buildPayload(includeArtwork: boolean): LibraryExportPayload {
  const db = getDb()
  return libraryExportSchema.parse({
    format: 'kokomovie-library',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    library: {
      watchlist: db.prepare('SELECT * FROM watchlist ORDER BY added_at').all() as WatchlistRow[],
      positions: db.prepare('SELECT * FROM playback_positions ORDER BY updated_at').all() as PositionRow[],
      preferences: db.prepare(
        'SELECT language, subtitle_default, autoplay, maturity_rating, source_discovery_mode FROM preferences WHERE id = 1',
      ).get() as PreferencesRow,
    },
    artwork: includeArtwork ? collectArtwork() : undefined,
  })
}

function previewPayload(payload: LibraryExportPayload): LibraryImportPreview {
  const db = getDb()
  const watchlistIds = new Set(
    (db.prepare('SELECT content_id FROM watchlist').all() as Array<{ content_id: string }>)
      .map((row) => row.content_id),
  )
  const positionIds = new Set(
    (db.prepare('SELECT content_id, episode_id FROM playback_positions').all() as Array<{ content_id: string; episode_id: string }>)
      .map(positionKey),
  )
  return {
    watchlist: payload.library.watchlist.length,
    positions: payload.library.positions.length,
    artwork: payload.artwork?.length ?? 0,
    watchlistConflicts: payload.library.watchlist.filter((row) => watchlistIds.has(row.content_id)).length,
    positionConflicts: payload.library.positions.filter((row) => positionIds.has(positionKey(row))).length,
    exportedAt: payload.exportedAt,
    appVersion: payload.appVersion,
  }
}

export async function safetyBackup(reason: string): Promise<string> {
  const db = getDb()
  const root = join(app.getPath('userData'), 'backups')
  mkdirSync(root, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(root, `kokomovie-${reason}-${stamp}.db`)
  await db.backup(path)
  return path
}

function restoreArtwork(payload: LibraryExportPayload): number {
  if (!payload.artwork?.length) return 0
  const root = join(app.getPath('userData'), 'catalog-artwork', 'v1')
  mkdirSync(root, { recursive: true })
  let restored = 0
  for (const entry of payload.artwork) {
    const file = basename(entry.file)
    if (file !== entry.file) continue
    const bytes = Buffer.from(entry.data, 'base64')
    if (bytes.length <= 0 || bytes.length > 15 * 1024 * 1024 || !hasValidArtworkSignature(file, bytes)) continue
    const target = join(root, file)
    const temporary = target + '.importing'
    writeFileSync(temporary, bytes)
    renameSync(temporary, target)
    restored++
  }
  return restored
}

export function applyPayload(payload: LibraryExportPayload, mode: 'merge' | 'replace'): {
  watchlist: number
  positions: number
} {
  const db = getDb()
  const apply = db.transaction(() => {
    if (mode === 'replace') {
      db.prepare('DELETE FROM watchlist').run()
      db.prepare('DELETE FROM playback_positions').run()
    }

    const watchlistExisting = db.prepare(
      'SELECT added_at FROM watchlist WHERE content_id = ?',
    )
    const watchlistWrite = db.prepare(
      `INSERT INTO watchlist (content_id, content_type, added_at) VALUES (?, ?, ?)
       ON CONFLICT(content_id) DO UPDATE SET
         content_type = excluded.content_type,
         added_at = excluded.added_at`,
    )
    let watchlist = 0
    for (const row of payload.library.watchlist) {
      const existing = watchlistExisting.get(row.content_id) as { added_at: string } | undefined
      if (mode === 'replace' || !existing || incomingWins(existing.added_at, row.added_at)) {
        watchlistWrite.run(row.content_id, row.content_type, row.added_at)
        watchlist++
      }
    }

    const positionExisting = db.prepare(
      'SELECT updated_at FROM playback_positions WHERE content_id = ? AND episode_id = ?',
    )
    const positionWrite = db.prepare(
      `INSERT INTO playback_positions
       (content_id, episode_id, content_type, position_seconds, duration_seconds, completed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(content_id, episode_id) DO UPDATE SET
         content_type = excluded.content_type,
         position_seconds = excluded.position_seconds,
         duration_seconds = excluded.duration_seconds,
         completed_at = excluded.completed_at,
         updated_at = excluded.updated_at`,
    )
    let positions = 0
    for (const row of payload.library.positions) {
      const existing = positionExisting.get(row.content_id, row.episode_id) as { updated_at: string } | undefined
      if (mode === 'replace' || !existing || incomingWins(existing.updated_at, row.updated_at)) {
        positionWrite.run(
          row.content_id,
          row.episode_id,
          row.content_type,
          row.position_seconds,
          row.duration_seconds,
          row.completed_at,
          row.updated_at,
        )
        positions++
      }
    }

    const preferences = payload.library.preferences
    db.prepare(
      `UPDATE preferences SET language = ?, subtitle_default = ?, autoplay = ?, maturity_rating = ?, source_discovery_mode = ?
       WHERE id = 1`,
    ).run(
      preferences.language,
      preferences.subtitle_default,
      preferences.autoplay,
      preferences.maturity_rating,
      preferences.source_discovery_mode,
    )
    return { watchlist, positions }
  })
  return apply()
}

export function registerLibraryPortabilityIpc(): void {
  ipcMain.handle('library:export-file', trustedIpcHandler(async (_event, input: unknown) => {
    const { includeArtwork } = z.object({ includeArtwork: z.boolean() }).strict().parse(input)
    const result = parentWindow()
      ? await dialog.showSaveDialog(parentWindow()!, {
        title: 'Export KokoMovie Library',
        defaultPath: `KokoMovie-Library-${new Date().toISOString().slice(0, 10)}.kokomovie-library.json`,
        filters: [{ name: 'KokoMovie Library', extensions: ['json'] }],
      })
      : await dialog.showSaveDialog({
        title: 'Export KokoMovie Library',
        defaultPath: 'KokoMovie-Library.kokomovie-library.json',
        filters: [{ name: 'KokoMovie Library', extensions: ['json'] }],
      })
    if (result.canceled || !result.filePath) return { cancelled: true }
    const payload = buildPayload(includeArtwork)
    const temporary = result.filePath + '.partial'
    writeFileSync(temporary, JSON.stringify(payload, null, 2), 'utf8')
    renameSync(temporary, result.filePath)
    return {
      cancelled: false,
      path: result.filePath,
      counts: {
        watchlist: payload.library.watchlist.length,
        positions: payload.library.positions.length,
        artwork: payload.artwork?.length ?? 0,
      },
    }
  }))

  ipcMain.handle('library:import-select', trustedIpcHandler(async () => {
    const result = parentWindow()
      ? await dialog.showOpenDialog(parentWindow()!, {
        title: 'Import KokoMovie Library',
        properties: ['openFile'],
        filters: [{ name: 'KokoMovie Library', extensions: ['json'] }],
      })
      : await dialog.showOpenDialog({
        title: 'Import KokoMovie Library',
        properties: ['openFile'],
        filters: [{ name: 'KokoMovie Library', extensions: ['json'] }],
      })
    if (result.canceled || !result.filePaths[0]) return { cancelled: true }
    const path = result.filePaths[0]
    if (statSync(path).size > MAX_IMPORT_BYTES) throw new Error('Library import is too large')
    const payload = libraryExportSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    const preview = previewPayload(payload)
    const token = randomUUID()
    const expiresAt = Date.now() + 10 * 60_000
    pendingImports.set(token, { payload, preview, expiresAt })
    setTimeout(() => pendingImports.delete(token), 10 * 60_000).unref()
    return { cancelled: false, token, preview }
  }))

  ipcMain.handle('library:import-apply', trustedIpcHandler(async (_event, input: unknown) => {
    const { token, mode } = importApplySchema.parse(input)
    const pending = pendingImports.get(token)
    if (!pending || pending.expiresAt < Date.now()) {
      pendingImports.delete(token)
      throw new Error('Import preview expired; choose the file again')
    }
    const backupPath = await safetyBackup('before-import')
    const applied = applyPayload(pending.payload, mode)
    const artwork = restoreArtwork(pending.payload)
    pendingImports.delete(token)
    return { ok: true, mode, backupPath, ...applied, artwork }
  }))
}
