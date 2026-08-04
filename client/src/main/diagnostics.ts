import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { getDb } from './db/sqlite.js'

const MAX_LOG_BYTES = 512 * 1024
const LOG_GENERATIONS = 3
const MAX_PREVIEW_EVENTS = 100

export interface DiagnosticEvent {
  at: string
  scope: string
  event: string
  detail?: string
}

export interface DiagnosticReport {
  format: 'kokomovie-diagnostics'
  schemaVersion: 1
  generatedAt: string
  application: { version: string; platform: NodeJS.Platform; arch: string; packaged: boolean }
  storage: { watchlistItems: number; savedPositions: number; downloadStates: Record<string, number> }
  events: DiagnosticEvent[]
  privacy: { excludes: string[] }
}

function logDirectory(): string { return join(app.getPath('userData'), 'logs') }
function logPath(): string { return join(logDirectory(), 'diagnostics.log') }

export function redactDiagnosticText(value: unknown): string {
  return String(value)
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[url]')
    .replace(/(?:bearer\s+|api[_-]?key[=:]\s*|token[=:]\s*)[^\s,;]+/gi, '[secret]')
    .replace(/\btt\d{5,12}\b/gi, '[content-id]')
    .replace(/[A-Za-z]:\\(?:[^\s"'<>]+\\)*[^\s"'<>]*/g, '[path]')
    .replace(/\/(?:home|Users|var|tmp)\/[^\s"'<>]+/g, '[path]')
    .slice(0, 500)
}

// Shared by the diagnostics log and the extraction log so neither can grow without bound.
// Keeps at most (LOG_GENERATIONS + 1) files of MAX_LOG_BYTES each.
export function rotateLogIfNeeded(path: string, nextBytes: number, maxBytes = MAX_LOG_BYTES): void {
  try {
    if (!existsSync(path) || statSync(path).size + nextBytes <= maxBytes) return
    for (let generation = LOG_GENERATIONS; generation >= 1; generation--) {
      const source = generation === 1 ? path : path + '.' + (generation - 1)
      const target = path + '.' + generation
      if (existsSync(source)) renameSync(source, target)
    }
  } catch {}
}

// Upgrades inherit logs written before rotation existed — real installations reached tens of
// megabytes. Rotation alone would preserve that file as a generation for a long time, so any
// generation still over the cap is discarded once at startup.
export function reclaimOversizedLog(path: string, maxBytes = MAX_LOG_BYTES): void {
  for (let generation = 0; generation <= LOG_GENERATIONS; generation++) {
    const candidate = generation === 0 ? path : path + '.' + generation
    try {
      if (existsSync(candidate) && statSync(candidate).size > maxBytes) rmSync(candidate, { force: true })
    } catch {}
  }
}

function rotateIfNeeded(nextBytes: number): void {
  rotateLogIfNeeded(logPath(), nextBytes)
}

export function writeDiagnosticEvent(scope: string, event: string, detail?: unknown): void {
  try {
    mkdirSync(logDirectory(), { recursive: true })
    const entry: DiagnosticEvent = {
      at: new Date().toISOString(),
      scope: redactDiagnosticText(scope),
      event: redactDiagnosticText(event),
      ...(detail === undefined ? {} : { detail: redactDiagnosticText(detail) }),
    }
    const line = JSON.stringify(entry) + '\n'
    rotateIfNeeded(Buffer.byteLength(line))
    appendFileSync(logPath(), line, 'utf8')
  } catch {}
}

function recentEvents(): DiagnosticEvent[] {
  try {
    return readFileSync(logPath(), 'utf8').trim().split('\n').slice(-MAX_PREVIEW_EVENTS).flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Partial<DiagnosticEvent>
        if (typeof parsed.at !== 'string' || typeof parsed.scope !== 'string' || typeof parsed.event !== 'string') return []
        return [{ at: parsed.at, scope: redactDiagnosticText(parsed.scope), event: redactDiagnosticText(parsed.event), ...(parsed.detail ? { detail: redactDiagnosticText(parsed.detail) } : {}) }]
      } catch { return [] }
    })
  } catch { return [] }
}

export function buildDiagnosticReport(): DiagnosticReport {
  const db = getDb()
  const count = (table: 'watchlist' | 'playback_positions'): number =>
    Number((db.prepare('SELECT COUNT(*) AS count FROM ' + table).get() as { count: number }).count)
  const downloadStates = Object.fromEntries(
    (db.prepare('SELECT status, COUNT(*) AS count FROM downloads GROUP BY status').all() as Array<{ status: string; count: number }>)
      .map((row) => [redactDiagnosticText(row.status), Number(row.count)]),
  )
  return {
    format: 'kokomovie-diagnostics',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    application: { version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged },
    storage: { watchlistItems: count('watchlist'), savedPositions: count('playback_positions'), downloadStates },
    events: recentEvents(),
    privacy: { excludes: ['API keys and tokens', 'content titles and IDs', 'watch history details', 'download paths', 'provider URLs and headers'] },
  }
}
