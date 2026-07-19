import { ipcMain, BrowserWindow, app, dialog, shell } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'child_process'
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  createHash,
} from 'crypto'
import { createWriteStream, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, renameSync, statSync, openSync, readSync, closeSync } from 'fs'
import { join, dirname } from 'path'
import https from 'https'
import http from 'http'
import zlib from 'zlib'
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

import { getStreamHeaders, mergeHeadersCaseInsensitive, getStandardHeight } from './providers.js'

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 32,
  keepAliveMsecs: 30000,
})

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
  keepAliveMsecs: 30000,
  rejectUnauthorized: false,
})

const activeRequests = new Map<string, http.ClientRequest[]>()
const hostNextRequestAt = new Map<string, number>()

class HttpStatusError extends Error {
  constructor(
    readonly statusCode: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`Request failed with status code ${statusCode}`)
    this.name = 'HttpStatusError'
  }
}

function parseRetryAfter(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(raw)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

async function waitForHostSlot(url: string, id?: string): Promise<void> {
  let host = ''
  try { host = new URL(url).host } catch { return }
  const now = Date.now()
  const waitMs = Math.max(0, (hostNextRequestAt.get(host) ?? now) - now)
  hostNextRequestAt.set(host, now + waitMs + 175)
  let remaining = waitMs
  while (remaining > 0) {
    if (id && cancelSignals.get(id)) throw new Error('cancelled')
    const slice = Math.min(remaining, 500)
    await new Promise((resolve) => setTimeout(resolve, slice))
    remaining -= slice
  }
}

function extendHostCooldown(url: string, delayMs: number): void {
  try {
    const host = new URL(url).host
    hostNextRequestAt.set(host, Math.max(hostNextRequestAt.get(host) ?? 0, Date.now() + delayMs))
  } catch { /* invalid URLs fail in the request itself */ }
}

function normalizeUrl(url: string): string {
  // Preserve KokoMovie proxy URLs. Provider probing validated this exact transport, and
  // proxy-rewritten HLS child URIs retain the required session headers/query tokens.
  // Unwrapping the URL here made downloads bypass the working playback path and caused
  // immediate CDN 400 responses even though the same stream played successfully.
  return url
}

function isDirectVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.toLowerCase()
    return pathname.endsWith('.mp4') || pathname.endsWith('.webm') || pathname.endsWith('.mkv')
  } catch {
    const lower = url.toLowerCase()
    return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mkv')
  }
}

function abortActiveRequests(id: string): void {
  const reqs = activeRequests.get(id)
  if (reqs) {
    for (const req of reqs) {
      try {
        req.destroy(new Error('cancelled'))
      } catch { /* ignore */ }
    }
    activeRequests.delete(id)
  }
}

function fetchBuffer(
  url: string,
  id?: string,
  customHeaders?: Record<string, string>,
  onProgress?: (received: number, total: number) => void,
  redirectsCount = 0
): Promise<Buffer> {
  if (redirectsCount > 5) {
    return Promise.reject(new Error('Too many redirects'))
  }

  const normalizedUrl = normalizeUrl(url)

  return new Promise((resolve, reject) => {
    let host = ''
    try {
      host = new URL(normalizedUrl).host
    } catch {}

    const streamHeaders = mergeHeadersCaseInsensitive(
      getStreamHeaders(host),
      customHeaders || {}
    )
    const reqHeaders: Record<string, string> = {}
    for (const [k, v] of Object.entries(streamHeaders)) {
      const lowerK = k.toLowerCase()
      if (
        lowerK !== 'host' &&
        !lowerK.startsWith('sec-') &&
        lowerK !== 'connection'
      ) {
        reqHeaders[k] = String(v)
      }
    }

    if (!reqHeaders['Accept-Encoding'] && !reqHeaders['accept-encoding']) {
      reqHeaders['Accept-Encoding'] = 'gzip, deflate'
    }

    if (!reqHeaders['User-Agent'] && !reqHeaders['user-agent']) {
      reqHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }

    const isHttps = normalizedUrl.startsWith('https')
    const get = isHttps ? https.get : http.get

    const options = {
      headers: reqHeaders,
      rejectUnauthorized: false,
      agent: isHttps ? httpsAgent : httpAgent,
    }

    const req = get(normalizedUrl, options, (res) => {
      const statusCode = res.statusCode ?? 200
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        const location = res.headers.location
        if (location) {
          cleanUpReq()
          const absoluteLocation = new URL(location, normalizedUrl).toString()
          resolve(fetchBuffer(absoluteLocation, id, customHeaders, onProgress, redirectsCount + 1))
          return
        }
      }

      if (statusCode < 200 || statusCode >= 300) {
        cleanUpReq()
        const retryAfterMs = parseRetryAfter(res.headers['retry-after'])
        res.resume()
        reject(new HttpStatusError(statusCode, retryAfterMs))
        return
      }

      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      const chunks: Buffer[] = []
      let received = 0

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        received += chunk.length
        onProgress?.(received, total)
      })

      res.on('end', () => {
        cleanUpReq()
        if (total > 0 && received < total) {
          reject(new Error(`Response terminated early: received ${received} of ${total} bytes`))
          return
        }
        let buffer = Buffer.concat(chunks)
        const encoding = res.headers['content-encoding']
        if (encoding === 'gzip') {
          try {
            buffer = zlib.gunzipSync(buffer)
          } catch (e) {
            reject(new Error(`Gzip decompression failed: ${e instanceof Error ? e.message : e}`))
            return
          }
        } else if (encoding === 'deflate') {
          try {
            buffer = zlib.inflateSync(buffer)
          } catch (e) {
            reject(new Error(`Deflate decompression failed: ${e instanceof Error ? e.message : e}`))
            return
          }
        }
        resolve(buffer)
      })
      res.on('error', (err) => {
        cleanUpReq()
        reject(err)
      })
    })

    if (id) {
      const reqs = activeRequests.get(id) || []
      reqs.push(req)
      activeRequests.set(id, reqs)
    }

    const cleanUpReq = () => {
      if (id) {
        const reqs = activeRequests.get(id)
        if (reqs) {
          const idx = reqs.indexOf(req)
          if (idx >= 0) {
            reqs.splice(idx, 1)
            if (reqs.length === 0) {
              activeRequests.delete(id)
            } else {
              activeRequests.set(id, reqs)
            }
          }
        }
      }
    }

    req.on('error', (err) => {
      cleanUpReq()
      reject(err)
    })
    req.setTimeout(30000, () => {
      cleanUpReq()
      req.destroy(new Error('Request timeout after 30s'))
    })
  })
}

async function fetchBufferWithRetry(
  url: string,
  id?: string,
  customHeaders?: Record<string, string>,
  onProgress?: (received: number, total: number) => void,
  maxAttempts = 3,
  initialDelayMs = 1000
): Promise<Buffer> {
  let attempt = 0
  while (true) {
    attempt++
    try {
      if (id && cancelSignals.get(id)) throw new Error('cancelled')
      await waitForHostSlot(url, id)
      return await fetchBuffer(url, id, customHeaders, onProgress)
    } catch (err) {
      if (err instanceof Error && err.message === 'cancelled') throw err
      if (id && cancelSignals.get(id)) throw new Error('cancelled')

      const status = err instanceof HttpStatusError ? err.statusCode : null
      const transientStatus = status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
      const allowedAttempts = status === 429 ? Math.max(maxAttempts, 8) : transientStatus || status === null ? Math.max(maxAttempts, 5) : 1
      if (attempt >= allowedAttempts) throw err

      const exponential = initialDelayMs * Math.pow(2, attempt - 1)
      const serverDelay = err instanceof HttpStatusError ? err.retryAfterMs ?? 0 : 0
      const jitter = Math.floor(Math.random() * Math.min(1000, exponential * 0.25))
      const delay = Math.min(60000, Math.max(exponential, serverDelay) + jitter)
      if (status === 429 || status === 503) extendHostCooldown(url, delay)
      console.log('[downloader] Attempt ' + attempt + ' failed. Retrying in ' + delay + 'ms. Error: ' + (err instanceof Error ? err.message : String(err)))
      if (status !== 429 && status !== 503) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
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

function getVariantScore(line: string): { stdHeight: number; bandwidth: number } {
  let bandwidth = 0
  let stdHeight = 0

  const bwMatch = line.match(/BANDWIDTH=(\d+)/i)
  if (bwMatch) {
    bandwidth = parseInt(bwMatch[1]!, 10)
  }

  const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i)
  if (resMatch) {
    const w = parseInt(resMatch[1]!, 10)
    const h = parseInt(resMatch[2]!, 10)
    if (!isNaN(w) && !isNaN(h)) {
      stdHeight = getStandardHeight(w, h)
    }
  }

  return { stdHeight, bandwidth }
}

async function parseManifest(manifestUrl: string, customHeaders?: Record<string, string>, id?: string): Promise<HlsManifest> {
  const normalizedManifestUrl = normalizeUrl(manifestUrl)
  const text = (await fetchBufferWithRetry(normalizedManifestUrl, id, customHeaders)).toString('utf-8')

  // Is this a master playlist?
  if (text.includes('#EXT-X-STREAM-INF')) {
    const lines = text.split('\n')
    let bestScore: { stdHeight: number; bandwidth: number } | null = null
    let bestUri = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const score = getVariantScore(line)
        const next = lines[i + 1]?.trim() ?? ''
        if (next && !next.startsWith('#')) {
          const uri = normalizeUrl(resolveUrl(normalizedManifestUrl, next))
          if (!bestScore) {
            bestScore = score
            bestUri = uri
          } else {
            let isBetter = false
            if (score.stdHeight === 1080 && bestScore.stdHeight !== 1080) {
              isBetter = true
            } else if (bestScore.stdHeight === 1080 && score.stdHeight !== 1080) {
              isBetter = false
            } else if (score.stdHeight === 1080 && bestScore.stdHeight === 1080) {
              isBetter = score.bandwidth > bestScore.bandwidth
            } else {
              if (score.stdHeight !== bestScore.stdHeight) {
                isBetter = score.stdHeight > bestScore.stdHeight
              } else {
                isBetter = score.bandwidth > bestScore.bandwidth
              }
            }

            if (isBetter) {
              bestScore = score
              bestUri = uri
            }
          }
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
      segments.push(normalizeUrl(resolveUrl(normalizedManifestUrl, trimmed)))
    }
  }

  return { isMaster: false, segments, rawPlaylist: text }
}

// ─── Active cancellation signals ─────────────────────────────────────────────

const cancelSignals = new Map<string, boolean>()
let activeCount = 0

async function downloadDirectVideo(
  id: string,
  row: DownloadRow,
  key: Buffer,
  localDir: string,
  customHeaders?: Record<string, string>
): Promise<void> {
  const db = getDb()
  const url = row.s3_hls_key
  const normalizedUrl = normalizeUrl(url)

  let currentUrl = normalizedUrl
  let redirectsCount = 0
  let responseStream: http.IncomingMessage | null = null
  let transientAttempts = 0

  while (redirectsCount <= 5) {
    if (cancelSignals.get(id)) throw new Error('cancelled')
    await waitForHostSlot(currentUrl, id)

    let host = ''
    try {
      host = new URL(currentUrl).host
    } catch {}

    const streamHeaders = mergeHeadersCaseInsensitive(
      getStreamHeaders(host),
      customHeaders || {}
    )

    const reqHeaders: Record<string, string> = {}
    for (const [k, v] of Object.entries(streamHeaders)) {
      const lowerK = k.toLowerCase()
      if (
        lowerK !== 'host' &&
        !lowerK.startsWith('sec-') &&
        lowerK !== 'connection'
      ) {
        reqHeaders[k] = String(v)
      }
    }

    if (!reqHeaders['Accept-Encoding'] && !reqHeaders['accept-encoding']) {
      reqHeaders['Accept-Encoding'] = 'gzip, deflate'
    }

    if (!reqHeaders['User-Agent'] && !reqHeaders['user-agent']) {
      reqHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }

    const isHttps = currentUrl.startsWith('https')
    const get = isHttps ? https.get : http.get

    const options = {
      headers: reqHeaders,
      rejectUnauthorized: false,
      agent: isHttps ? httpsAgent : httpAgent,
    }

    const res: http.IncomingMessage = await new Promise((resolve, reject) => {
      const req = get(currentUrl, options, (res) => {
        resolve(res)
      })

      const reqs = activeRequests.get(id) || []
      reqs.push(req)
      activeRequests.set(id, reqs)

      req.on('error', reject)
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout after 30s'))
      })
    })

    const statusCode = res.statusCode ?? 200
    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const location = res.headers.location
      if (location) {
        currentUrl = new URL(location, currentUrl).toString()
        redirectsCount++
        res.resume() // consume stream
        continue
      }
    }

    if (statusCode < 200 || statusCode >= 300) {
      res.resume()
      const err = new HttpStatusError(statusCode, parseRetryAfter(res.headers['retry-after']))
      const transient = statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode === 500 || statusCode === 502 || statusCode === 503 || statusCode === 504
      transientAttempts++
      const allowedAttempts = statusCode === 429 ? 8 : transient ? 5 : 1
      if (transientAttempts >= allowedAttempts) throw err
      const exponential = 1000 * Math.pow(2, transientAttempts - 1)
      const jitter = Math.floor(Math.random() * Math.min(1000, exponential * 0.25))
      const delay = Math.min(60000, Math.max(exponential, err.retryAfterMs ?? 0) + jitter)
      extendHostCooldown(currentUrl, delay)
      continue
    }

    responseStream = res
    break
  }

  if (!responseStream) {
    throw new Error('Too many redirects or no stream returned')
  }

  const total = parseInt(responseStream.headers['content-length'] ?? '0', 10)
  const contentType = responseStream.headers['content-type'] || 'video/mp4'

  let received = 0
  let completed = 0
      let downloadedBytes = 0
      let estimatedTotalBytes = 0
  const CHUNK_SIZE = 2 * 1024 * 1024 // 2MB chunk size

  let chunkBuffer = Buffer.alloc(CHUNK_SIZE)
  let bytesInChunk = 0

  const startTime = Date.now()

  // Setup decompression if response is encoded
  let decompressor: any = null
  const encoding = responseStream.headers['content-encoding']
  if (encoding === 'gzip') {
    decompressor = zlib.createGunzip()
  } else if (encoding === 'deflate') {
    decompressor = zlib.createInflate()
  }

  const inputStream: NodeJS.ReadableStream = decompressor 
    ? responseStream.pipe(decompressor)
    : responseStream

  // Wait for data chunk by chunk
  await new Promise<void>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      if (cancelSignals.get(id)) {
        cleanup()
        reject(new Error('cancelled'))
        return
      }

      let offset = 0
      while (offset < chunk.length) {
        const spaceLeft = CHUNK_SIZE - bytesInChunk
        const bytesToCopy = Math.min(spaceLeft, chunk.length - offset)
        chunk.copy(chunkBuffer, bytesInChunk, offset, offset + bytesToCopy)
        bytesInChunk += bytesToCopy
        offset += bytesToCopy

        if (bytesInChunk === CHUNK_SIZE) {
          // Encrypt and write chunk
          const encrypted = encryptSegment(chunkBuffer, key)
          const segPath = join(localDir, `seg_${completed}.enc`)
          writeFileSync(segPath, encrypted)
          completed++

          // Reset chunk
          chunkBuffer = Buffer.alloc(CHUNK_SIZE)
          bytesInChunk = 0
        }
      }

      received += chunk.length
      const elapsedSec = (Date.now() - startTime) / 1000
      const speedKbps = elapsedSec > 0 ? Math.round((received / 1024) / elapsedSec) : 0

      let overallPct = 0
      if (total > 0) {
        overallPct = Math.round((received / total) * 100)
      } else {
        overallPct = Math.min(99, Math.round(completed * 2))
      }
      if (overallPct > 100) overallPct = 100

      db.prepare(`UPDATE downloads SET progress_percent = ?, download_speed_kbps = ?, downloaded_bytes = ?, total_bytes = ? WHERE id = ?`).run(overallPct, speedKbps, received, total, id)
      notifyProgress(id, overallPct, 'downloading', completed, 0, received, total)
    }

    const onEnd = () => {
      cleanup()
      resolve()
    }

    const onAborted = () => { cleanup(); reject(new Error('Download response was interrupted before completion')) }

    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }

    const cleanup = () => {
      inputStream.removeListener('data', onData)
      inputStream.removeListener('end', onEnd)
      inputStream.removeListener('error', onError)
      responseStream?.removeListener('aborted', onAborted)
      if (cancelSignals.get(id)) {
        try { responseStream?.destroy() } catch {}
        try { decompressor?.destroy() } catch {}
      }
    }

    inputStream.on('data', onData)
    inputStream.on('end', onEnd)
    inputStream.on('error', onError)
    responseStream.on('aborted', onAborted)
  })

  // Write the last chunk if any
  if (bytesInChunk > 0) {
    const finalPlain = chunkBuffer.subarray(0, bytesInChunk)
    const encrypted = encryptSegment(finalPlain, key)
    const segPath = join(localDir, `seg_${completed}.enc`)
    writeFileSync(segPath, encrypted)
    completed++
  }

  // Some providers return a tiny MP4 error/placeholder with a successful HTTP status.
  // Never mark that response as a completed feature-length download.
  if ((row.duration_mins ?? 0) >= 20 && received < 5 * 1024 * 1024) {
    throw new Error('Provider returned an undersized placeholder (' + received + ' bytes), not the requested video')
  }

  db.prepare('UPDATE downloads SET progress_percent = 99 WHERE id = ?').run(id)
  notifyProgress(id, 99, 'downloading', completed, completed, received, received)
  const portable = await finalizeDirectMp4(row, key, completed)
  rmSync(localDir, { recursive: true, force: true })
  db.prepare(`
    UPDATE downloads SET status = 'completed', progress_percent = 100, downloaded_at = ?, manifest_path = ?, local_dir = ?, downloaded_bytes = ?, total_bytes = ?
    WHERE id = ?
  `).run(new Date().toISOString(), portable.path, portable.path, portable.size, portable.size, id)
  notifyProgress(id, 100, 'completed', completed, completed, portable.size, portable.size)
}

const FFMPEG_BIN = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : null

function portableVideoPath(row: DownloadRow): string {
  const safeTitle = row.title.replace(/[\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "KokoMovie Download"
  const baseDir = dirname(row.local_dir)
  const preferred = join(baseDir, safeTitle + '.mp4')
  return existsSync(preferred) ? join(baseDir, safeTitle + ' - ' + row.id.slice(0, 8) + '.mp4') : preferred
}

async function finalizeDirectMp4(row: DownloadRow, key: Buffer, chunkCount: number): Promise<{ path: string; size: number }> {
  if (!FFMPEG_BIN) throw new Error('The bundled FFmpeg executable is unavailable')
  const outputPath = portableVideoPath(row)
  const partialPath = outputPath + '.partial'
  const ff = spawn(FFMPEG_BIN, ['-y', '-loglevel', 'error', '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', partialPath], { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  ff.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000) })
  const exited = new Promise<void>((resolve, reject) => {
    ff.once('error', reject)
    ff.once('close', (code) => code === 0 ? resolve() : reject(new Error('MP4 finalization failed: ' + (stderr.trim() || 'FFmpeg exited with code ' + code))))
  })
  try {
    for (let i = 0; i < chunkCount; i++) {
      const plain = decryptSegment(readFileSync(join(row.local_dir, 'seg_' + i + '.enc')), key)
      if (!ff.stdin.write(plain)) await new Promise<void>((resolve) => ff.stdin.once('drain', resolve))
    }
    ff.stdin.end()
    await exited
    renameSync(partialPath, outputPath)
    return { path: outputPath, size: statSync(outputPath).size }
  } catch (err) {
    try { ff.kill('SIGKILL') } catch {}
    try { rmSync(partialPath, { force: true }) } catch {}
    throw err
  }
}

async function finalizeHlsMp4(row: DownloadRow, key: Buffer, segmentCount: number): Promise<{ path: string; size: number }> {
  if (!FFMPEG_BIN) throw new Error('The bundled FFmpeg executable is unavailable')
  const outputPath = portableVideoPath(row)
  const partialPath = outputPath + '.partial'
  const ff = spawn(FFMPEG_BIN, [
    '-y', '-loglevel', 'error', '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart',
    '-f', 'mp4', partialPath,
  ], { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  ff.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000) })
  const exited = new Promise<void>((resolve, reject) => {
    ff.once('error', reject)
    ff.once('close', (code) => code === 0 ? resolve() : reject(new Error('MP4 finalization failed: ' + (stderr.trim() || 'FFmpeg exited with code ' + code))))
  })
  try {
    for (let i = 0; i < segmentCount; i++) {
      const encrypted = readFileSync(join(row.local_dir, 'seg_' + i + '.enc'))
      const plain = decryptSegment(encrypted, key)
      if (!ff.stdin.write(plain)) await new Promise<void>((resolve) => ff.stdin.once('drain', resolve))
    }
    ff.stdin.end()
    await exited
    renameSync(partialPath, outputPath)
    return { path: outputPath, size: statSync(outputPath).size }
  } catch (err) {
    try { ff.kill('SIGKILL') } catch {}
    try { rmSync(partialPath, { force: true }) } catch {}
    throw err
  }
}

// ─── Core download logic ──────────────────────────────────────────────────────

async function downloadContent(id: string): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as DownloadRow | undefined
  if (!row || row.status === 'cancelled') return

  db.prepare(`UPDATE downloads SET status = 'downloading' WHERE id = ?`).run(id)

  const key = deriveSegmentKey(row.drm_key_id)
  const localDir = row.local_dir
  const customHeaders = row.headers ? JSON.parse(row.headers) : undefined

  try {
    if (isDirectVideoUrl(row.s3_hls_key)) {
      await downloadDirectVideo(id, row, key, localDir, customHeaders)
      return
    }

    // Parse manifest (may be master or variant)
    let variantUrl = normalizeUrl(row.s3_hls_key)
    let rawPlaylist = ''
    let variantSegments: string[] = []

    const master = await parseManifest(variantUrl, customHeaders, id)
    if (master.isMaster && master.variantUrl) {
      variantUrl = master.variantUrl
      const variant = await parseManifest(variantUrl, customHeaders, id)
      variantSegments = variant.segments
      rawPlaylist = variant.rawPlaylist
    } else if (!master.isMaster && master.segments.length > 0) {
      variantSegments = master.segments
      rawPlaylist = master.rawPlaylist
    }

    if (variantSegments.length > 0) {
      db.prepare(`UPDATE downloads SET total_segments = ? WHERE id = ?`).run(variantSegments.length, id)

      let completed = 0
      let downloadedBytes = 0
      let estimatedTotalBytes = 0
      for (const segUrl of variantSegments) {
        if (cancelSignals.get(id)) throw new Error('cancelled')

        const segName = `seg_${completed}.enc`
        const segPath = join(localDir, segName)

        const startTime = Date.now()
        const plain = await fetchBufferWithRetry(segUrl, id, customHeaders, (recv, total) => {
          const elapsedSec = (Date.now() - startTime) / 1000
          const speedKbps = elapsedSec > 0 ? Math.round((recv / 1024) / elapsedSec) : 0

          let overallPct = Math.round((completed / variantSegments.length) * 100)
          if (total > 0) {
            overallPct = Math.round(((completed + (recv / total)) / variantSegments.length) * 100)
          }
          if (total > 0) {
            estimatedTotalBytes = Math.max(estimatedTotalBytes, Math.round(((downloadedBytes + total) / (completed + 1)) * variantSegments.length))
          }
          db.prepare(`UPDATE downloads SET progress_percent = ?, download_speed_kbps = ?, downloaded_bytes = ?, total_bytes = ? WHERE id = ?`).run(overallPct, speedKbps, downloadedBytes + recv, estimatedTotalBytes, id)
          notifyProgress(id, overallPct, 'downloading', completed, variantSegments.length, downloadedBytes + recv, estimatedTotalBytes)
        })

        const encrypted = encryptSegment(plain, key)
        writeFileSync(segPath, encrypted)
        downloadedBytes += plain.length
        completed++

        const finalPct = Math.round((completed / variantSegments.length) * 100)
        db.prepare(`UPDATE downloads SET completed_segments = ?, progress_percent = ? WHERE id = ?`).run(completed, finalPct, id)
        notifyProgress(id, finalPct, 'downloading', completed, variantSegments.length, downloadedBytes, estimatedTotalBytes)
      }

      // Remux the locally cached transport stream into one portable MP4. This copies
      // video/audio without re-encoding, then removes the internal segment cache.
      db.prepare('UPDATE downloads SET progress_percent = 99 WHERE id = ?').run(id)
      notifyProgress(id, 99, 'downloading', completed, variantSegments.length, downloadedBytes, downloadedBytes)
      const portable = await finalizeHlsMp4(row, key, completed)
      rmSync(localDir, { recursive: true, force: true })

      db.prepare(`
        UPDATE downloads SET status = 'completed', progress_percent = 100, downloaded_at = ?, manifest_path = ?, local_dir = ?, downloaded_bytes = ?, total_bytes = ?
        WHERE id = ?
      `).run(new Date().toISOString(), portable.path, portable.path, portable.size, portable.size, id)

      notifyProgress(id, 100, 'completed', completed, variantSegments.length, portable.size, portable.size)
    } else {
      // No HLS segments found (dev/mock scenario) — mark complete with empty manifest
      const manifestPath = join(localDir, 'manifest.m3u8')
      writeFileSync(manifestPath, master.rawPlaylist)
      db.prepare(`UPDATE downloads SET status = 'completed', progress_percent = 100, downloaded_at = ?, manifest_path = ?, downloaded_bytes = ?, total_bytes = ? WHERE id = ?`)
        .run(new Date().toISOString(), manifestPath, 0, 0, id)

      notifyProgress(id, 100, 'completed', 0, 0)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'cancelled' || cancelSignals.get(id)) {
      notifyProgress(id, 0, 'cancelled')
    } else {
      const exists = db.prepare('SELECT 1 FROM downloads WHERE id = ?').get(id)
      if (exists) {
        db.prepare(`UPDATE downloads SET status = 'error', error_message = ? WHERE id = ?`).run(message, id)
      }
      notifyProgress(id, 0, 'error')
    }
  } finally {
    cancelSignals.delete(id)
    activeCount--
    processQueue()
  }
}

function processQueue(): void {
  if (activeCount >= MAX_CONCURRENT) return
  const db = getDb()
  const next = db.prepare(`SELECT id FROM downloads WHERE status = 'pending' ORDER BY rowid LIMIT 1`).get() as { id: string } | undefined
  if (!next) return
  activeCount++
  downloadContent(next.id)
}

function notifyProgress(
  id: string,
  percent: number,
  status?: string,
  completedSegments?: number,
  totalSegments?: number,
  downloadedBytes?: number,
  totalBytes?: number
): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send('download:progress', {
    id,
    percent,
    status,
    completedSegments,
    totalSegments,
    downloadedBytes,
    totalBytes,
  })
}

// ─── IPC registration ─────────────────────────────────────────────────────────

export function registerDownloadIpc(): void {
  const db = getDb()

  // Reset any interrupted downloads (status = 'downloading') back to 'pending' on startup
  db.prepare(`UPDATE downloads SET status = 'pending' WHERE status = 'downloading'`).run()

  // Trigger processQueue() once on startup to resume download queue
  processQueue()
  // Upgrade legacy completed segment caches into the portable MP4 format in place.
  const legacyRows = db.prepare("SELECT * FROM downloads WHERE status = 'completed' AND manifest_path LIKE '%.m3u8'").all() as DownloadRow[]
  void (async () => {
    for (const row of legacyRows) {
      try {
        db.prepare("UPDATE downloads SET status = 'downloading', progress_percent = 99, error_message = NULL WHERE id = ?").run(row.id)
        notifyProgress(row.id, 99, 'downloading', row.completed_segments, row.total_segments, row.downloaded_bytes, row.total_bytes)
        const portable = await finalizeHlsMp4(row, deriveSegmentKey(row.drm_key_id), row.completed_segments)
        rmSync(row.local_dir, { recursive: true, force: true })
        db.prepare("UPDATE downloads SET status = 'completed', progress_percent = 100, downloaded_at = ?, manifest_path = ?, local_dir = ?, downloaded_bytes = ?, total_bytes = ? WHERE id = ?")
          .run(new Date().toISOString(), portable.path, portable.path, portable.size, portable.size, row.id)
        notifyProgress(row.id, 100, 'completed', row.completed_segments, row.total_segments, portable.size, portable.size)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        db.prepare("UPDATE downloads SET status = 'error', error_message = ? WHERE id = ?").run(message, row.id)
        notifyProgress(row.id, 0, 'error')
      }
    }
  })()

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
      customDownloadPath?: string
      headers?: Record<string, string>
    },
  ) => {
    const id = crypto.randomUUID()
    const baseDir = opts.customDownloadPath || join(app.getPath('userData'), 'downloads')
    const localDir = join(baseDir, id)
    mkdirSync(localDir, { recursive: true })

    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

    db.prepare(`
      INSERT INTO downloads (id, content_id, episode_id, title, content_type, thumbnail_url, duration_mins,
        s3_hls_key, drm_key_id, status, local_dir, expires_at, headers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      id, opts.contentId, opts.episodeId ?? null, opts.title, opts.contentType,
      opts.thumbnailUrl ?? null, opts.durationMins ?? null,
      opts.manifestUrl, opts.drmKeyId ?? null, localDir, expiresAt,
      opts.headers ? JSON.stringify(opts.headers) : null
    )

    processQueue()
    return { id, expiresAt }
  })

  ipcMain.handle('download:cancel', (_event, id: string) => {
    cancelSignals.set(id, true)
    abortActiveRequests(id)
    const row = db.prepare('SELECT local_dir FROM downloads WHERE id = ?').get(id) as { local_dir: string } | undefined
    db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
    if (row) {
      setTimeout(() => {
        try { rmSync(row.local_dir, { recursive: true, force: true }) } catch { /* ignore */ }
      }, 500)
    }
    return true
  })

  ipcMain.handle('download:delete', (_event, id: string) => {
    cancelSignals.set(id, true)
    abortActiveRequests(id)
    const row = db.prepare('SELECT local_dir FROM downloads WHERE id = ?').get(id) as { local_dir: string } | undefined
    db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
    if (row) {
      setTimeout(() => {
        try { rmSync(row.local_dir, { recursive: true, force: true }) } catch { /* ignore */ }
      }, 500)
    }
    return true
  })

  ipcMain.handle('download:list', () =>
    db.prepare('SELECT * FROM downloads ORDER BY rowid DESC').all() as DownloadRow[],
  )

  ipcMain.handle('download:get-manifest', (_event, id: string) => {
    const row = db.prepare('SELECT manifest_path, drm_key_id FROM downloads WHERE id = ? AND status = ?').get(id, 'completed') as { manifest_path: string; drm_key_id: string | null } | undefined
    if (!row?.manifest_path || !existsSync(row.manifest_path)) return null
    if (row.manifest_path.toLowerCase().endsWith('.mp4')) {
      return { manifestContent: 'direct:offline://' + id + '/video.mp4', drmKeyId: null }
    }
    return { manifestContent: readFileSync(row.manifest_path, 'utf-8'), drmKeyId: row.drm_key_id }
  })

  // Legacy shim — kept for any callers that still use the old API
  ipcMain.handle('download:queue', () =>
    db.prepare('SELECT * FROM downloads WHERE status IN (?,?) ORDER BY rowid').all('pending', 'downloading') as DownloadRow[],
  )
  ipcMain.handle('download:segment', async (_event, _url: string, _path: string) => {
    return { error: 'Use download:start instead' }
  })

  // Directory selection & default downloads directory IPCs
  ipcMain.handle('dialog:select-directory', async () => {
    const windows = BrowserWindow.getAllWindows()
    const parentWindow = windows[0]
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('download:open-folder', async (_event, id?: string) => {
    const row = id ? db.prepare('SELECT local_dir FROM downloads WHERE id = ?').get(id) as { local_dir: string } | undefined : undefined
    const target = row?.local_dir ? dirname(row.local_dir) : join(app.getPath('userData'), 'downloads')
    mkdirSync(target, { recursive: true })
    const error = await shell.openPath(target)
    return { ok: !error, error: error || undefined }
  })

  ipcMain.handle('download:get-default-dir', () => {
    return join(app.getPath('userData'), 'downloads')
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
    return decryptSegment(readFileSync(segPath), key)
  } catch {
    return null
  }
}

export interface DirectVideoRangeResult {
  status: number
  headers: Record<string, string>
  data: Buffer | null
}

function readPortableVideoRange(filePath: string, rangeHeader: string | null): DirectVideoRangeResult {
  const totalSize = statSync(filePath).size
  let start = 0
  let end = totalSize - 1
  let isRange = true
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
    if (match) {
      const startText = match[1] ?? ''
      const endText = match[2] ?? ''
      if (!startText && endText) {
        start = Math.max(0, totalSize - Number(endText))
      } else {
        if (startText) start = Number(startText)
        if (endText) end = Number(endText)
      }
    }
  }
  if (start >= totalSize) return { status: 416, headers: { 'Content-Range': 'bytes */' + totalSize }, data: null }
  end = Math.min(end, totalSize - 1, start + 4 * 1024 * 1024 - 1)
  const length = end - start + 1
  const data = Buffer.allocUnsafe(length)
  const fd = openSync(filePath, 'r')
  try { readSync(fd, data, 0, length, start) } finally { closeSync(fd) }
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4', 'Content-Length': String(length), 'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  }
  if (isRange) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + totalSize
  return { status: isRange ? 206 : 200, headers, data }
}

export function decryptLocalDirectVideoRange(
  downloadId: string,
  rangeHeader: string | null
): DirectVideoRangeResult {
  try {
    const db = getDb()
    const row = db.prepare('SELECT local_dir, drm_key_id FROM downloads WHERE id = ?').get(downloadId) as { local_dir: string; drm_key_id: string | null } | undefined
    if (!row) {
      return { status: 404, headers: {}, data: null }
    }

    if (row.local_dir.toLowerCase().endsWith('.mp4') && existsSync(row.local_dir)) {
      return readPortableVideoRange(row.local_dir, rangeHeader)
    }
    const metadataPath = join(row.local_dir, 'metadata.json')
    if (!existsSync(metadataPath)) {
      return { status: 404, headers: {}, data: null }
    }

    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'))
    const totalSize = metadata.totalSize
    const chunkSize = metadata.chunkSize ?? 2097152
    const contentType = metadata.contentType ?? 'video/mp4'

    let start = 0
    let end = totalSize - 1
    let isRange = false

    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      isRange = true
      const parts = rangeHeader.substring(6).split('-')
      const startVal = parts[0] ? parseInt(parts[0], 10) : NaN
      const endVal = parts[1] ? parseInt(parts[1], 10) : NaN

      if (!isNaN(startVal) && isNaN(endVal)) {
        start = startVal
        end = totalSize - 1
      } else if (isNaN(startVal) && !isNaN(endVal)) {
        start = totalSize - endVal
        end = totalSize - 1
      } else if (!isNaN(startVal) && !isNaN(endVal)) {
        start = startVal
        end = endVal
      }
    }

    if (start < 0) start = 0
    if (end >= totalSize) end = totalSize - 1

    if (start >= totalSize) {
      return {
        status: 416,
        headers: {
          'Content-Range': `bytes */${totalSize}`,
          'Access-Control-Allow-Origin': '*',
        },
        data: null
      }
    }

    // Limit maximum response size to prevent Out of Memory
    const MAX_RESPONSE_SIZE = 4 * 1024 * 1024 // 4MB
    if (end - start + 1 > MAX_RESPONSE_SIZE) {
      end = start + MAX_RESPONSE_SIZE - 1
    }
    if (end >= totalSize) {
      end = totalSize - 1
    }

    const responseLength = end - start + 1
    const startChunk = Math.floor(start / chunkSize)
    const endChunk = Math.floor(end / chunkSize)

    const key = deriveSegmentKey(row.drm_key_id)
    const decryptedChunks: Buffer[] = []

    for (let c = startChunk; c <= endChunk; c++) {
      const segName = `seg_${c}.enc`
      const segPath = join(row.local_dir, segName)
      if (!existsSync(segPath)) {
        return { status: 404, headers: {}, data: null }
      }
      const encrypted = readFileSync(segPath)
      const decrypted = decryptSegment(encrypted, key)
      decryptedChunks.push(decrypted)
    }

    const fullBuffer = Buffer.concat(decryptedChunks)
    const offsetInFull = start - startChunk * chunkSize
    const sliced = fullBuffer.subarray(offsetInFull, offsetInFull + responseLength)

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(sliced.length),
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    }

    if (isRange) {
      headers['Content-Range'] = `bytes ${start}-${end}/${totalSize}`
    }

    return {
      status: isRange ? 206 : 200,
      headers,
      data: sliced,
    }
  } catch (err) {
    console.error('[decryptLocalDirectVideoRange] error:', err)
    return { status: 500, headers: {}, data: null }
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
