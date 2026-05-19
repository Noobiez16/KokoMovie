import { ipcMain, BrowserWindow, app } from 'electron'
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  createHash,
} from 'crypto'
import { createWriteStream, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import https from 'https'
import http from 'http'
import { getDb, type DownloadRow } from '../db/sqlite.js'

const MAX_CONCURRENT = 3
const DOWNLOAD_TTL_DAYS = 30
const GCM_IV_LEN = 12
const GCM_TAG_LEN = 16

// ─── Device fingerprint for offline key derivation ────────────────────────────

function getDeviceFingerprint(): Buffer {
  const raw = app.getPath('userData') + process.platform + (process.env['COMPUTERNAME'] ?? '')
  return createHash('sha256').update(raw).digest()
}

function deriveSegmentKey(drmKeyId: string | null): Buffer {
  const ikm = getDeviceFingerprint()
  const salt = Buffer.from(drmKeyId ?? 'no-drm-key', 'utf-8')
  return Buffer.from(
    hkdfSync('sha256', ikm, salt, 'kokomovie-offline-v1', 32),
  )
}

// ─── AES-256-GCM helpers ──────────────────────────────────────────────────────

function encryptSegment(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(GCM_IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  // Layout: [IV(12)] [TAG(16)] [CIPHERTEXT]
  return Buffer.concat([iv, tag, ciphertext])
}

export function decryptSegment(encrypted: Buffer, key: Buffer): Buffer {
  const iv = encrypted.subarray(0, GCM_IV_LEN)
  const tag = encrypted.subarray(GCM_IV_LEN, GCM_IV_LEN + GCM_TAG_LEN)
  const ciphertext = encrypted.subarray(GCM_IV_LEN + GCM_TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// ─── HTTP fetch helper ────────────────────────────────────────────────────────

function fetchBuffer(url: string, onProgress?: (received: number, total: number) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get
    get(url, (res) => {
      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      const chunks: Buffer[] = []
      let received = 0

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        received += chunk.length
        onProgress?.(received, total)
      })

      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ─── HLS manifest parser ──────────────────────────────────────────────────────

interface HlsManifest {
  isMaster: boolean
  variantUrl?: string    // best variant playlist URL from master
  segments: string[]     // absolute segment URLs
  rawPlaylist: string
}

function resolveUrl(base: string, relative: string): string {
  if (relative.startsWith('http')) return relative
  const url = new URL(base)
  if (relative.startsWith('/')) {
    return `${url.protocol}//${url.host}${relative}`
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/[^/]*$/, '/')}${relative}`
}

async function parseManifest(manifestUrl: string): Promise<HlsManifest> {
  const text = (await fetchBuffer(manifestUrl)).toString('utf-8')

  // Is this a master playlist?
  if (text.includes('#EXT-X-STREAM-INF')) {
    // Pick the highest bandwidth variant
    const lines = text.split('\n')
    let bestBandwidth = 0
    let bestUri = ''
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/)
        const bw = bwMatch ? parseInt(bwMatch[1]!, 10) : 0
        const next = lines[i + 1]?.trim() ?? ''
        if (bw >= bestBandwidth && next && !next.startsWith('#')) {
          bestBandwidth = bw
          bestUri = resolveUrl(manifestUrl, next)
        }
      }
    }
    return { isMaster: true, variantUrl: bestUri, segments: [], rawPlaylist: text }
  }

  // Variant playlist — extract segment URLs
  const segments: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      segments.push(resolveUrl(manifestUrl, trimmed))
    }
  }

  return { isMaster: false, segments, rawPlaylist: text }
}

// ─── Active cancellation signals ─────────────────────────────────────────────

const cancelSignals = new Map<string, boolean>()
let activeCount = 0

// ─── Core download logic ──────────────────────────────────────────────────────

async function downloadContent(id: string): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as DownloadRow | undefined
  if (!row || row.status === 'cancelled') return

  db.prepare(`UPDATE downloads SET status = 'downloading' WHERE id = ?`).run(id)

  const key = deriveSegmentKey(row.drm_key_id)
  const localDir = row.local_dir

  try {
    // Parse manifest (may be master or variant)
    let variantUrl = row.s3_hls_key
    let rawPlaylist: string

    const master = await parseManifest(variantUrl)
    if (master.isMaster && master.variantUrl) {
      variantUrl = master.variantUrl
      const variant = await parseManifest(variantUrl)
      rawPlaylist = variant.rawPlaylist
      db.prepare(`UPDATE downloads SET total_segments = ? WHERE id = ?`).run(variant.segments.length, id)

      let completed = 0
      for (const segUrl of variant.segments) {
        if (cancelSignals.get(id)) throw new Error('cancelled')

        const segName = `seg_${completed}.enc`
        const segPath = join(localDir, segName)

        const plain = await fetchBuffer(segUrl, (recv, total) => {
          if (total > 0) {
            const overallPct = Math.round(((completed + recv / total) / variant.segments.length) * 100)
            db.prepare(`UPDATE downloads SET progress_percent = ?, download_speed_kbps = ? WHERE id = ?`).run(overallPct, Math.round(recv / 1024), id)
            notifyProgress(id, overallPct)
          }
        })

        const encrypted = encryptSegment(plain, key)
        writeFileSync(segPath, encrypted)
        completed++
        db.prepare(`UPDATE downloads SET completed_segments = ? WHERE id = ?`).run(completed, id)
      }

      // Write local manifest with offline:// segment paths
      const offlinePlaylist = rawPlaylist.replace(
        /^(?!#)(.+\.ts.*)$/gm,
        (_: string, seg: string) => {
          const idx = variant.segments.findIndex((s) => s.endsWith(seg.trim()) || seg.trim().endsWith(s.split('/').pop()!))
          const segIndex = idx >= 0 ? idx : completed - 1
          return `offline://${id}/seg_${segIndex}.enc`
        },
      )
      const manifestPath = join(localDir, 'manifest.m3u8')
      writeFileSync(manifestPath, offlinePlaylist)

      db.prepare(`
        UPDATE downloads SET status = 'completed', progress_percent = 100, downloaded_at = ?, manifest_path = ?
        WHERE id = ?
      `).run(new Date().toISOString(), manifestPath, id)
    } else {
      // No HLS segments found (dev/mock scenario) — mark complete with empty manifest
      const manifestPath = join(localDir, 'manifest.m3u8')
      writeFileSync(manifestPath, master.rawPlaylist)
      db.prepare(`UPDATE downloads SET status = 'completed', progress_percent = 100, downloaded_at = ?, manifest_path = ? WHERE id = ?`)
        .run(new Date().toISOString(), manifestPath, id)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'cancelled') {
      db.prepare(`UPDATE downloads SET status = 'cancelled' WHERE id = ?`).run(id)
    } else {
      db.prepare(`UPDATE downloads SET status = 'error', error_message = ? WHERE id = ?`).run(message, id)
    }
  } finally {
    cancelSignals.delete(id)
    activeCount--
    processQueue()
  }

  notifyProgress(id, 100)
}

function processQueue(): void {
  if (activeCount >= MAX_CONCURRENT) return
  const db = getDb()
  const next = db.prepare(`SELECT id FROM downloads WHERE status = 'pending' ORDER BY rowid LIMIT 1`).get() as { id: string } | undefined
  if (!next) return
  activeCount++
  downloadContent(next.id)
}

function notifyProgress(id: string, percent: number): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send('download:progress', { id, percent })
}

// ─── IPC registration ─────────────────────────────────────────────────────────

export function registerDownloadIpc(): void {
  const db = getDb()

  ipcMain.handle('download:start', async (
    _event,
    opts: {
      contentId: string
      episodeId?: string
      title: string
      contentType: string
      thumbnailUrl?: string
      durationMins?: number
      manifestUrl: string
      drmKeyId?: string
    },
  ) => {
    const id = crypto.randomUUID()
    const localDir = join(app.getPath('userData'), 'downloads', id)
    mkdirSync(localDir, { recursive: true })

    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

    db.prepare(`
      INSERT INTO downloads (id, content_id, episode_id, title, content_type, thumbnail_url, duration_mins,
        s3_hls_key, drm_key_id, status, local_dir, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id, opts.contentId, opts.episodeId ?? null, opts.title, opts.contentType,
      opts.thumbnailUrl ?? null, opts.durationMins ?? null,
      opts.manifestUrl, opts.drmKeyId ?? null, localDir, expiresAt,
    )

    processQueue()
    return { id, expiresAt }
  })

  ipcMain.handle('download:cancel', (_event, id: string) => {
    cancelSignals.set(id, true)
    db.prepare(`UPDATE downloads SET status = 'cancelled' WHERE id = ? AND status IN ('pending','downloading')`).run(id)
    return true
  })

  ipcMain.handle('download:delete', (_event, id: string) => {
    const row = db.prepare('SELECT local_dir FROM downloads WHERE id = ?').get(id) as { local_dir: string } | undefined
    if (row) {
      try { rmSync(row.local_dir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('download:list', () =>
    db.prepare('SELECT * FROM downloads ORDER BY rowid DESC').all() as DownloadRow[],
  )

  ipcMain.handle('download:get-manifest', (_event, id: string) => {
    const row = db.prepare('SELECT manifest_path, drm_key_id FROM downloads WHERE id = ? AND status = ?').get(id, 'completed') as { manifest_path: string; drm_key_id: string | null } | undefined
    if (!row?.manifest_path || !existsSync(row.manifest_path)) return null
    return { manifestContent: readFileSync(row.manifest_path, 'utf-8'), drmKeyId: row.drm_key_id }
  })

  // Legacy shim — kept for any callers that still use the old API
  ipcMain.handle('download:queue', () =>
    db.prepare('SELECT * FROM downloads WHERE status IN (?,?) ORDER BY rowid').all('pending', 'downloading') as DownloadRow[],
  )
  ipcMain.handle('download:segment', async (_event, _url: string, _path: string) => {
    return { error: 'Use download:start instead' }
  })
}

// ─── Offline segment decryption for protocol handler ─────────────────────────

export function decryptLocalSegment(downloadId: string, segmentFilename: string): Buffer | null {
  try {
    const db = getDb()
    const row = db.prepare('SELECT local_dir, drm_key_id FROM downloads WHERE id = ?').get(downloadId) as { local_dir: string; drm_key_id: string | null } | undefined
    if (!row) return null

    const segPath = join(row.local_dir, segmentFilename)
    if (!existsSync(segPath)) return null

    const key = deriveSegmentKey(row.drm_key_id)
    const encrypted = readFileSync(segPath)
    return decryptSegment(encrypted, key)
  } catch {
    return null
  }
}

// ─── TTL enforcement ──────────────────────────────────────────────────────────

export function purgeExpiredDownloads(): void {
  const db = getDb()
  const expired = db.prepare(`SELECT id, local_dir FROM downloads WHERE expires_at < ?`).all(new Date().toISOString()) as Array<{ id: string; local_dir: string }>

  for (const row of expired) {
    try { rmSync(row.local_dir, { recursive: true, force: true }) } catch { /* ignore */ }
    db.prepare('DELETE FROM downloads WHERE id = ?').run(row.id)
  }

  if (expired.length > 0) {
    console.log(`[downloads] Purged ${expired.length} expired download(s)`)
  }
}
