import { ipcMain, BrowserWindow, app, dialog, shell, net } from 'electron'
import { FFMPEG_BIN } from '../ffmpeg.js'
import { spawn } from 'child_process'
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  createHash,
} from 'crypto'
import { copyFileSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync, existsSync, renameSync, statSync, openSync, readSync, closeSync, writeSync } from 'fs'
import { basename, join, dirname, isAbsolute } from 'path'
import https from 'https'
import http from 'http'
import { contiguousRecoverablePrefix } from '../download-state-policy.js'
import { downloadIdSchema, downloadStartSchema, type DownloadStartInput } from '../download-contracts.js'
import zlib from 'zlib'
import { normalizeSubtitleText, parseByteRange } from '../download-offline-policy'
import { getDb, type DownloadRow } from '../db/sqlite.js'
import { createAuthenticatedHttpAgents } from '../providers/http-agents.js'
import { headersForDownloadTarget } from '../download-header-policy.js'
import { unwrapLocalMediaProxyUrl } from '../providers/local-media-capability.js'
import { decorateHlsManifestWithLocalCapability, withLocalMediaCapability } from '../providers/local-media-capability.js'
import { resolveValidatedRedirect } from '../providers/network-policy.js'
import {
  createHlsDownloadPlan,
  materializeHlsObject,
  UnsupportedHlsError,
  type HlsByteRange,
  type HlsDownloadPlan,
} from '../hls-download-plan.js'
import { PublicIpcError, trustedIpcHandler } from './security.js'

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

import { getStreamHeaders, getStreamProxyPort, mergeHeadersCaseInsensitive, validateDownloadSourceUrl } from './providers.js'

const { httpAgent, httpsAgent } = createAuthenticatedHttpAgents(32)

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
    if (id && pauseSignals.get(id)) throw new Error('paused')
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
  redirectsCount = 0,
  onFinalUrl?: (url: string) => void,
  sourceUrl = url,
  requestHeaders: Record<string, string> = {},
  maxBytes?: number,
): Promise<Buffer> {
  if (redirectsCount > 5) {
    return Promise.reject(new Error('Too many redirects'))
  }

  const normalizedUrl = normalizeUrl(url)

  return new Promise((resolve, reject) => {
    validateDownloadSourceUrl(normalizedUrl)
    const originHeaders = headersForDownloadTarget(
      normalizedUrl,
      sourceUrl,
      customHeaders,
      getStreamHeaders(normalizedUrl),
    )
    const streamHeaders = mergeHeadersCaseInsensitive(originHeaders, requestHeaders)
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
      reqHeaders['Accept-Encoding'] = maxBytes ? 'identity' : 'gzip, deflate'
    }

    if (!reqHeaders['User-Agent'] && !reqHeaders['user-agent']) {
      reqHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }

    const isHttps = normalizedUrl.startsWith('https')
    const get = isHttps ? https.get : http.get

    const options = {
      headers: reqHeaders,
      agent: isHttps ? httpsAgent : httpAgent,
    }

    const req = get(normalizedUrl, options, (res) => {
      const statusCode = res.statusCode ?? 200
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        const location = res.headers.location
        if (location) {
          cleanUpReq()
          const absoluteLocation = resolveValidatedRedirect(normalizedUrl, location).toString()
          resolve(fetchBuffer(absoluteLocation, id, customHeaders, onProgress, redirectsCount + 1, onFinalUrl, sourceUrl, requestHeaders, maxBytes))
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
      if (maxBytes && total > maxBytes) {
        cleanUpReq()
        res.destroy()
        reject(new ResponseTooLargeError())
        return
      }
      const chunks: Buffer[] = []
      let received = 0

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        received += chunk.length
        if (maxBytes && received > maxBytes) {
          cleanUpReq()
          res.destroy()
          reject(new ResponseTooLargeError())
          return
        }
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
            buffer = zlib.gunzipSync(buffer, maxBytes ? { maxOutputLength: maxBytes } : undefined)
          } catch (e) {
            reject(new Error(`Gzip decompression failed: ${e instanceof Error ? e.message : e}`))
            return
          }
        } else if (encoding === 'deflate') {
          try {
            buffer = zlib.inflateSync(buffer, maxBytes ? { maxOutputLength: maxBytes } : undefined)
          } catch (e) {
            reject(new Error(`Deflate decompression failed: ${e instanceof Error ? e.message : e}`))
            return
          }
        }
        if (maxBytes && buffer.length > maxBytes) {
          reject(new ResponseTooLargeError())
          return
        }
        onFinalUrl?.(normalizedUrl)
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
  initialDelayMs = 1000,
  onFinalUrl?: (url: string) => void,
  sourceUrl = url,
  requestHeaders: Record<string, string> = {},
  maxBytes?: number,
): Promise<Buffer> {
  let attempt = 0
  while (true) {
    attempt++
    try {
      if (id && cancelSignals.get(id)) throw new Error('cancelled')
    if (id && pauseSignals.get(id)) throw new Error('paused')
      await waitForHostSlot(url, id)
      return await fetchBuffer(url, id, customHeaders, onProgress, 0, onFinalUrl, sourceUrl, requestHeaders, maxBytes)
    } catch (err) {
      if (err instanceof Error && err.message === 'cancelled') throw err
      if (err instanceof ResponseTooLargeError) throw err
      if (id && cancelSignals.get(id)) throw new Error('cancelled')
    if (id && pauseSignals.get(id)) throw new Error('paused')

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

// ─── Standards-aware HLS planning ─────────────────────────────────────────────

const pendingHlsPlans = new Map<string, HlsDownloadPlan>()

async function buildDownloadPlan(
  manifestUrl: string,
  customHeaders?: Record<string, string>,
  id?: string,
): Promise<HlsDownloadPlan> {
  return createHlsDownloadPlan(normalizeUrl(manifestUrl), async (playlistUrl) => {
    let finalUrl = playlistUrl
    const body = await fetchBufferWithRetry(
      playlistUrl,
      id,
      customHeaders,
      undefined,
      3,
      1000,
      (resolvedUrl) => { finalUrl = resolvedUrl },
      manifestUrl,
    )
    return { text: body.toString('utf8'), finalUrl }
  })
}

class ResponseTooLargeError extends Error {
  constructor() {
    super('Response exceeds the permitted download size')
    this.name = 'ResponseTooLargeError'
  }
}

// ─── Active cancellation signals ─────────────────────────────────────────────

const cancelSignals = new Map<string, boolean>()
const pauseSignals = new Map<string, boolean>()
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
    if (pauseSignals.get(id)) throw new Error('paused')
    await waitForHostSlot(currentUrl, id)

    validateDownloadSourceUrl(currentUrl)
    const streamHeaders = headersForDownloadTarget(
      currentUrl,
      normalizedUrl,
      customHeaders,
      getStreamHeaders(currentUrl),
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
      agent: isHttps ? httpsAgent : httpAgent,
    }

    const res: http.IncomingMessage = await new Promise((resolve, reject) => {
      const req = get(currentUrl, options, (res) => {
        const removeRequest = () => {
          const current = activeRequests.get(id)
          if (!current) return
          const remaining = current.filter((candidate) => candidate !== req)
          if (remaining.length > 0) activeRequests.set(id, remaining)
          else activeRequests.delete(id)
        }
        res.once('end', removeRequest)
        res.once('close', removeRequest)
        res.once('error', removeRequest)
        resolve(res)
      })

      const reqs = activeRequests.get(id) || []
      reqs.push(req)
      activeRequests.set(id, reqs)

      req.on('error', (error) => {
        activeRequests.set(id, (activeRequests.get(id) ?? []).filter((candidate) => candidate !== req))
        reject(error)
      })
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout after 30s'))
      })
    })

    const statusCode = res.statusCode ?? 200
    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const location = res.headers.location
      if (location) {
        currentUrl = resolveValidatedRedirect(currentUrl, location).toString()
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

  let received = 0
  let completed = 0
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
      if (pauseSignals.get(id)) {
        cleanup()
        reject(new Error('paused'))
        return
      }
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
      if (pauseSignals.get(id) || cancelSignals.get(id)) {
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
      await artworkJobs.get(row.id)
  writePortableSidecars(row, portable.path)
      artworkJobs.delete(row.id)
  rmSync(localDir, { recursive: true, force: true })
  db.prepare(`
    UPDATE downloads SET status = 'completed', progress_percent = 100, downloaded_at = ?, manifest_path = ?, local_dir = ?, downloaded_bytes = ?, total_bytes = ?
    WHERE id = ?
  `).run(new Date().toISOString(), portable.path, portable.path, portable.size, portable.size, id)
  notifyProgress(id, 100, 'completed', completed, completed, portable.size, portable.size)
}

function portableVideoPath(row: DownloadRow): string {
  const safeTitle = row.title.replace(/[\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "KokoMovie Download"
  const baseDir = dirname(row.local_dir)
  const preferred = join(baseDir, safeTitle + '.mp4')
  return existsSync(preferred) ? join(baseDir, safeTitle + ' - ' + row.id.slice(0, 8) + '.mp4') : preferred
}

function validatePortableVideo(path: string, durationMins: number | null): void {
  const size = statSync(path).size
  const minimum = (durationMins ?? 0) >= 20 ? 1024 * 1024 : 1
  if (size < minimum) throw new Error('Finalized MP4 is unexpectedly small')
  const fd = openSync(path, 'r')
  try {
    const header = Buffer.alloc(16)
    const bytesRead = readSync(fd, header, 0, header.length, 0)
    if (bytesRead < 8 || header.subarray(4, 8).toString('ascii') !== 'ftyp') {
      throw new Error('Finalized output is not a valid MP4 container')
    }
  } finally {
    closeSync(fd)
  }
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
    validatePortableVideo(partialPath, row.duration_mins)
    renameSync(partialPath, outputPath)
    return { path: outputPath, size: statSync(outputPath).size }
  } catch (err) {
    try { ff.kill('SIGKILL') } catch {}
    try { rmSync(partialPath, { force: true }) } catch {}
    throw err
  }
}

function writeDecryptedTrack(row: DownloadRow, key: Buffer, path: string, startIndex: number, count: number): void {
  const fd = openSync(path, 'w')
  try {
    for (let offset = 0; offset < count; offset++) {
      const encrypted = readFileSync(join(row.local_dir, `seg_${startIndex + offset}.enc`))
      writeSync(fd, decryptSegment(encrypted, key))
    }
  } finally {
    closeSync(fd)
  }
}

async function finalizeHlsMp4(row: DownloadRow, key: Buffer, plan: HlsDownloadPlan): Promise<{ path: string; size: number }> {
  if (!FFMPEG_BIN) throw new Error('The bundled FFmpeg executable is unavailable')
  const outputPath = portableVideoPath(row)
  const partialPath = outputPath + '.partial'
  const videoInputPath = join(row.local_dir, 'video-input.partial')
  const audioInputPath = join(row.local_dir, 'audio-input.partial')
  writeDecryptedTrack(row, key, videoInputPath, 0, plan.video.objects.length)
  if (plan.audio) writeDecryptedTrack(row, key, audioInputPath, plan.video.objects.length, plan.audio.objects.length)
  const ff = spawn(FFMPEG_BIN, [
    '-y', '-loglevel', 'error', '-i', videoInputPath,
    ...(plan.audio ? ['-i', audioInputPath] : []),
    '-map', '0:v:0', ...(plan.audio ? ['-map', '1:a:0?'] : ['-map', '0:a:0?']),
    '-c', 'copy', '-movflags', '+faststart',
    '-f', 'mp4', partialPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  ff.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000) })
  const exited = new Promise<void>((resolve, reject) => {
    ff.once('error', reject)
    ff.once('close', (code) => code === 0 ? resolve() : reject(new Error('MP4 finalization failed: ' + (stderr.trim() || 'FFmpeg exited with code ' + code))))
  })
  try {
    await exited
    validatePortableVideo(partialPath, row.duration_mins)
    renameSync(partialPath, outputPath)
    return { path: outputPath, size: statSync(outputPath).size }
  } catch (err) {
    try { ff.kill('SIGKILL') } catch {}
    try { rmSync(partialPath, { force: true }) } catch {}
    throw err
  } finally {
    try { rmSync(videoInputPath, { force: true }) } catch {}
    try { rmSync(audioInputPath, { force: true }) } catch {}
  }
}

function legacyHlsPlan(segmentCount: number): HlsDownloadPlan {
  return {
    video: {
      playlistUrl: 'legacy://segment-cache',
      objects: Array.from({ length: segmentCount }, (_, mediaSequence) => ({
        kind: 'segment' as const,
        uri: `legacy://segment/${mediaSequence}`,
        mediaSequence,
        discontinuity: false,
      })),
    },
  }
}

// ─── Core download logic ──────────────────────────────────────────────────────

async function downloadContent(id: string): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as DownloadRow | undefined
  if (!row || row.status === 'cancelled') {
    pendingHlsPlans.delete(id)
    return
  }

  db.prepare(`UPDATE downloads SET status = 'downloading' WHERE id = ?`).run(id)

  const key = deriveSegmentKey(row.drm_key_id)
  const localDir = row.local_dir
  const customHeaders = row.headers ? JSON.parse(row.headers) : undefined

  try {
    if (isDirectVideoUrl(row.s3_hls_key)) {
      await downloadDirectVideo(id, row, key, localDir, customHeaders)
      return
    }

    const plan = pendingHlsPlans.get(id) ?? await buildDownloadPlan(row.s3_hls_key, customHeaders, id)
    pendingHlsPlans.delete(id)
    const downloadObjects = [...plan.video.objects, ...(plan.audio?.objects ?? [])]
    db.prepare(`UPDATE downloads SET total_segments = ? WHERE id = ?`).run(downloadObjects.length, id)

    const existingSegmentSizes = new Map<number, number>()
    for (const name of readdirSync(localDir)) {
      const match = name.match(/^seg_(\d+)\.enc$/)
      if (!match) continue
      try {
        const index = Number(match[1])
        const encrypted = readFileSync(join(localDir, name))
        decryptSegment(encrypted, key)
        existingSegmentSizes.set(index, encrypted.length)
      } catch { /* leave corrupt or incomplete files outside the recoverable prefix */ }
    }
    const recovered = contiguousRecoverablePrefix(existingSegmentSizes, downloadObjects.length)
    let completed = recovered.completed
    let downloadedBytes = Array.from(existingSegmentSizes.entries())
      .filter(([index]) => index < completed)
      .reduce((total, [, size]) => total + Math.max(0, size - GCM_IV_LEN - GCM_TAG_LEN), 0)
    let estimatedTotalBytes = row.total_bytes || 0
    if (completed > 0) {
      const resumedPct = Math.round((completed / downloadObjects.length) * 100)
      db.prepare('UPDATE downloads SET completed_segments = ?, progress_percent = ?, downloaded_bytes = ? WHERE id = ?')
        .run(completed, resumedPct, downloadedBytes, id)
      notifyProgress(id, resumedPct, 'downloading', completed, downloadObjects.length, downloadedBytes, estimatedTotalBytes)
    }
    const hlsKeyCache = new Map<string, Buffer>()
    for (const object of downloadObjects.slice(completed)) {
      if (cancelSignals.get(id)) throw new Error('cancelled')
    if (pauseSignals.get(id)) throw new Error('paused')

      const segName = `seg_${completed}.enc`
      const segPath = join(localDir, segName)

      const startTime = Date.now()
      const plain = await materializeHlsObject(object, async (resourceUrl, byteRange?: HlsByteRange) => {
        const requestHeaders = byteRange
          ? { Range: `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}` }
          : undefined
        const reportProgress = resourceUrl === object.uri ? (recv: number, total: number) => {
          const elapsedSec = (Date.now() - startTime) / 1000
          const speedKbps = elapsedSec > 0 ? Math.round((recv / 1024) / elapsedSec) : 0

          let overallPct = Math.round((completed / downloadObjects.length) * 100)
          if (total > 0) {
            overallPct = Math.round(((completed + (recv / total)) / downloadObjects.length) * 100)
          }
          if (total > 0) {
            estimatedTotalBytes = Math.max(estimatedTotalBytes, Math.round(((downloadedBytes + total) / (completed + 1)) * downloadObjects.length))
          }
          db.prepare(`UPDATE downloads SET progress_percent = ?, download_speed_kbps = ?, downloaded_bytes = ?, total_bytes = ? WHERE id = ?`).run(overallPct, speedKbps, downloadedBytes + recv, estimatedTotalBytes, id)
          notifyProgress(id, overallPct, 'downloading', completed, downloadObjects.length, downloadedBytes + recv, estimatedTotalBytes)
        } : undefined
        return fetchBufferWithRetry(resourceUrl, id, customHeaders, reportProgress, 3, 1000, undefined, row.s3_hls_key, requestHeaders)
      }, hlsKeyCache)

      const encrypted = encryptSegment(plain, key)
      writeFileSync(segPath, encrypted)
      downloadedBytes += plain.length
      completed++

      const finalPct = Math.round((completed / downloadObjects.length) * 100)
      db.prepare(`UPDATE downloads SET completed_segments = ?, progress_percent = ? WHERE id = ?`).run(completed, finalPct, id)
      notifyProgress(id, finalPct, 'downloading', completed, downloadObjects.length, downloadedBytes, estimatedTotalBytes)
    }

    // Remux the locally cached TS or fMP4 tracks into one portable MP4 without re-encoding.
    db.prepare('UPDATE downloads SET progress_percent = 99 WHERE id = ?').run(id)
    notifyProgress(id, 99, 'downloading', completed, downloadObjects.length, downloadedBytes, downloadedBytes)
    const portable = await finalizeHlsMp4(row, key, plan)
    await artworkJobs.get(row.id)
    writePortableSidecars(row, portable.path)
    artworkJobs.delete(row.id)
    rmSync(localDir, { recursive: true, force: true })

    db.prepare(`
      UPDATE downloads SET status = 'completed', progress_percent = 100, downloaded_at = ?, manifest_path = ?, local_dir = ?, downloaded_bytes = ?, total_bytes = ?
      WHERE id = ?
    `).run(new Date().toISOString(), portable.path, portable.path, portable.size, portable.size, id)

    notifyProgress(id, 100, 'completed', completed, downloadObjects.length, portable.size, portable.size)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'paused' || pauseSignals.get(id)) {
      const current = db.prepare(
        'SELECT progress_percent, completed_segments, total_segments, downloaded_bytes, total_bytes FROM downloads WHERE id = ?',
      ).get(id) as Pick<DownloadRow, 'progress_percent' | 'completed_segments' | 'total_segments' | 'downloaded_bytes' | 'total_bytes'> | undefined
      db.prepare("UPDATE downloads SET status = 'paused', download_speed_kbps = 0 WHERE id = ?").run(id)
      notifyProgress(
        id,
        current?.progress_percent ?? 0,
        'paused',
        current?.completed_segments,
        current?.total_segments,
        current?.downloaded_bytes,
        current?.total_bytes,
      )
      return
    }
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
    pauseSignals.delete(id)
    activeRequests.delete(id)
    activeCount--

    processQueue()
  }
}

function processQueue(): void {
  const db = getDb()
  while (activeCount < MAX_CONCURRENT) {
    const next = db.prepare(`SELECT id FROM downloads WHERE status = 'pending' ORDER BY rowid LIMIT 1`).get() as { id: string } | undefined
    if (!next) return
    activeCount++
    void downloadContent(next.id)
  }
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

// ─── Offline download artwork, subtitle, and metadata sidecars ─────────────────────────────────────────────────────────
const MAX_DOWNLOAD_ARTWORK_BYTES = 15 * 1024 * 1024
const artworkJobs = new Map<string, Promise<void>>()

async function cacheDownloadArtwork(id: string, sourceUrl: string, localDir: string): Promise<void> {
  try {
    let bytes: Uint8Array
    if (new URL(sourceUrl).protocol === 'catalog-cache:') {
      const response = await net.fetch(sourceUrl, { signal: AbortSignal.timeout(20_000) })
      if (!response.ok) return
      const declared = Number(response.headers.get('content-length') ?? 0)
      if (declared > MAX_DOWNLOAD_ARTWORK_BYTES) return
      bytes = new Uint8Array(await response.arrayBuffer())
    } else {
      validateDownloadSourceUrl(sourceUrl)
      bytes = new Uint8Array(await fetchBufferWithRetry(sourceUrl, id, undefined, undefined, 3, 1000, undefined, sourceUrl, {}, MAX_DOWNLOAD_ARTWORK_BYTES))
    }
    if (bytes.byteLength > MAX_DOWNLOAD_ARTWORK_BYTES) return
    writeFileSync(join(localDir, 'artwork.jpg'), bytes)
    getDb().prepare('UPDATE downloads SET thumbnail_url = ? WHERE id = ?')
      .run(`offline://${id}/artwork.jpg`, id)
  } catch {
    // Artwork is optional; the download itself must continue.
  }
}

interface DownloadSubtitleInput {
  lang: string
  url: string
}

interface OfflineSubtitle {
  id: number
  name: string
  lang: string
  url: string
}

async function cacheDownloadSubtitles(localDir: string, tracks: DownloadSubtitleInput[]): Promise<void> {
  const selected = tracks.slice(0, 8)
  if (selected.length === 0) return
  const subtitleDir = join(localDir, 'subtitles')
  mkdirSync(subtitleDir, { recursive: true })
  const saved: Array<{ file: string; lang: string; name: string }> = []

  for (const [index, track] of selected.entries()) {
    try {
      const url = new URL(track.url)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
      validateDownloadSourceUrl(url.toString())
      const bytes = new Uint8Array(await fetchBufferWithRetry(url.toString(), undefined, undefined, undefined, 3, 1000, undefined, url.toString(), {}, 2 * 1024 * 1024))
      if (bytes.byteLength > 2 * 1024 * 1024) continue
      const text = normalizeSubtitleText(new TextDecoder().decode(bytes))
      const lang = track.lang.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 16) || 'und'
      const file = `${index}-${lang}.vtt`
      writeFileSync(join(subtitleDir, file), text, 'utf8')
      saved.push({ file, lang, name: lang.toUpperCase() })
    } catch {
      // Individual subtitle failures do not fail the media download.
    }
  }
  writeFileSync(join(subtitleDir, 'index.json'), JSON.stringify(saved, null, 2), 'utf8')
}

function copySubtitleSidecars(row: DownloadRow, mediaPath: string): void {
  const source = join(row.local_dir, 'subtitles')
  if (!existsSync(source)) return
  const target = mediaPath + '.subtitles'
  mkdirSync(target, { recursive: true })
  for (const name of readdirSync(source)) {
    if (/^(?:\d+-[a-z0-9-]+\.vtt|index\.json)$/.test(name)) copyFileSync(join(source, name), join(target, name))
  }
}

export function listOfflineSubtitles(downloadId: string): OfflineSubtitle[] {
  const row = getDb().prepare('SELECT local_dir, manifest_path FROM downloads WHERE id = ?')
    .get(downloadId) as { local_dir: string; manifest_path: string | null } | undefined
  if (!row) return []
  const root = row.manifest_path?.toLowerCase().endsWith('.mp4')
    ? row.manifest_path + '.subtitles'
    : join(row.local_dir, 'subtitles')
  try {
    const entries = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) as Array<{ file: string; lang: string; name: string }>
    return entries
      .filter((entry) => /^\d+-[a-z0-9-]+\.vtt$/.test(entry.file))
      .map((entry, index) => ({ id: 1000 + index, name: entry.name, lang: entry.lang, url: withLocalMediaCapability(`offline://${downloadId}/subtitle/${entry.file}`) }))
  } catch {
    return []
  }
}

export function readOfflineSubtitle(downloadId: string, filename: string): string | null {
  if (!/^\d+-[a-z0-9-]+\.vtt$/.test(filename)) return null
  const row = getDb().prepare('SELECT local_dir, manifest_path FROM downloads WHERE id = ?')
    .get(downloadId) as { local_dir: string; manifest_path: string | null } | undefined
  if (!row) return null
  const root = row.manifest_path?.toLowerCase().endsWith('.mp4')
    ? row.manifest_path + '.subtitles'
    : join(row.local_dir, 'subtitles')
  try {
    return readFileSync(join(root, filename), 'utf8')
  } catch {
    return null
  }
}
function writePortableSidecars(row: DownloadRow, mediaPath: string): void {
  const temporaryArtwork = join(row.local_dir, 'artwork.jpg')
  const artworkPath = mediaPath + '.jpg'
  copySubtitleSidecars(row, mediaPath)
  if (existsSync(temporaryArtwork)) copyFileSync(temporaryArtwork, artworkPath)

  const metadata = {
    schemaVersion: 1,
    downloadId: row.id,
    contentId: row.content_id,
    episodeId: row.episode_id,
    title: row.title,
    contentType: row.content_type,
    durationMins: row.duration_mins,
    mediaFile: basename(mediaPath),
    artworkFile: existsSync(artworkPath) ? basename(artworkPath) : null,
    subtitleDirectory: existsSync(mediaPath + '.subtitles') ? basename(mediaPath + '.subtitles') : null,
    downloadedAt: new Date().toISOString(),
  }
  writeFileSync(mediaPath + '.kokomovie.json', JSON.stringify(metadata, null, 2), 'utf8')
}

export function readOfflineArtwork(downloadId: string): Buffer | null {
  const row = getDb().prepare('SELECT local_dir, manifest_path FROM downloads WHERE id = ?')
    .get(downloadId) as { local_dir: string; manifest_path: string | null } | undefined
  if (!row) return null
  const path = row.manifest_path?.toLowerCase().endsWith('.mp4')
    ? row.manifest_path + '.jpg'
    : join(row.local_dir, 'artwork.jpg')
  try {
    return existsSync(path) ? readFileSync(path) : null
  } catch {
    return null
  }
}

// ─── IPC registration ─────────────────────────────────────────────────────────
export function registerDownloadIpc(): void {
  const db = getDb()

  void (async () => {
    const backupDir = join(app.getPath('userData'), 'backups')
    const backupPath = join(backupDir, `kokomovie-${new Date().toISOString().slice(0, 10)}.db`)
    mkdirSync(backupDir, { recursive: true })
    if (!existsSync(backupPath)) {
      try {
        await db.backup(backupPath)
      } catch (error) {
        console.error('[downloads] SQLite safety backup failed; recovery will continue:', error)
      }
    }

    // Requeue only transfers interrupted by process termination. Valid encrypted HLS
    // segments remain in place and are reconciled by downloadContent before fetching.
    db.prepare("UPDATE downloads SET status = 'pending' WHERE status = 'downloading'").run()

    // A completed row whose media was moved or deleted remains visible and recoverable
    // instead of silently disappearing from the library.
    const completedRows = db.prepare(
      "SELECT id, manifest_path FROM downloads WHERE status = 'completed'",
    ).all() as Array<{ id: string; manifest_path: string | null }>
    for (const row of completedRows) {
      if (row.manifest_path && !existsSync(row.manifest_path)) {
        db.prepare("UPDATE downloads SET status = 'error', error_message = ? WHERE id = ?")
          .run('Downloaded media is missing or was moved outside KokoMovie', row.id)
      }
    }

    // Report only orphaned UUID work directories inside KokoMovie's own default folder.
    // Never inspect, rename, import, or remove files in user-selected directories.
    const defaultDir = join(app.getPath('userData'), 'downloads')
    if (existsSync(defaultDir)) {
      const referenced = new Set(
        (db.prepare('SELECT local_dir FROM downloads').all() as Array<{ local_dir: string }>)
          .map((row) => row.local_dir),
      )
      for (const entry of readdirSync(defaultDir, { withFileTypes: true })) {
        const path = join(defaultDir, entry.name)
        if (entry.isDirectory() && /^[0-9a-f-]{36}$/i.test(entry.name) && !referenced.has(path)) {
          console.warn(`[downloads] Recoverable orphan directory detected: ${entry.name}`)
        }
      }
    }

    // Upgrade v1.4.1 segment-cache downloads in place only after the safety backup.
    const legacyRows = db.prepare(
      "SELECT * FROM downloads WHERE status = 'completed' AND manifest_path LIKE '%.m3u8'",
    ).all() as DownloadRow[]
    for (const row of legacyRows) {
      try {
        db.prepare("UPDATE downloads SET status = 'downloading', progress_percent = 99, error_message = NULL WHERE id = ?").run(row.id)
        notifyProgress(row.id, 99, 'downloading', row.completed_segments, row.total_segments, row.downloaded_bytes, row.total_bytes)
        const portable = await finalizeHlsMp4(row, deriveSegmentKey(row.drm_key_id), legacyHlsPlan(row.completed_segments))
        await artworkJobs.get(row.id)
        writePortableSidecars(row, portable.path)
        artworkJobs.delete(row.id)
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
    processQueue()
  })()

  ipcMain.handle('download:start', trustedIpcHandler(async (
    _event,
    input: unknown,
  ) => {
    const opts: DownloadStartInput = downloadStartSchema.parse(input)
    validateDownloadSourceUrl(opts.manifestUrl)
    if (opts.customDownloadPath && !isAbsolute(opts.customDownloadPath)) {
      throw new Error("Download directory must be an absolute path")
    }
    let preflightPlan: HlsDownloadPlan | undefined
    if (!isDirectVideoUrl(opts.manifestUrl)) {
      try {
        preflightPlan = await buildDownloadPlan(opts.manifestUrl, opts.headers)
      } catch (error) {
        if (error instanceof UnsupportedHlsError) throw new PublicIpcError(error.code)
        throw error
      }
    }
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
       unwrapLocalMediaProxyUrl(opts.manifestUrl, getStreamProxyPort()), opts.drmKeyId ?? null, localDir, expiresAt,
      opts.headers ? JSON.stringify(opts.headers) : null
    )

    writeFileSync(join(localDir, 'content.kokomovie.json'), JSON.stringify({
      schemaVersion: 1, downloadId: id, contentId: opts.contentId, episodeId: opts.episodeId ?? null,
      title: opts.title, contentType: opts.contentType, durationMins: opts.durationMins ?? null,
      createdAt: new Date().toISOString(),
    }, null, 2), 'utf8')
    const assetJobs: Promise<void>[] = []
    if (opts.thumbnailUrl) assetJobs.push(cacheDownloadArtwork(id, opts.thumbnailUrl, localDir))
    if (opts.subtitles?.length) assetJobs.push(cacheDownloadSubtitles(localDir, opts.subtitles))
    if (assetJobs.length) artworkJobs.set(id, Promise.all(assetJobs).then(() => undefined))
    if (preflightPlan) pendingHlsPlans.set(id, preflightPlan)

    processQueue()
    return { id, expiresAt }
  }))

  ipcMain.handle('download:pause', trustedIpcHandler((_event, rawId: unknown) => {
    const id = downloadIdSchema.parse(rawId)
    const row = db.prepare('SELECT status, s3_hls_key, progress_percent, completed_segments, total_segments, downloaded_bytes, total_bytes FROM downloads WHERE id = ?')
      .get(id) as Pick<DownloadRow, 'status' | 's3_hls_key' | 'progress_percent' | 'completed_segments' | 'total_segments' | 'downloaded_bytes' | 'total_bytes'> | undefined
    if (!row || !['pending', 'downloading'].includes(row.status)) {
      return { ok: false, reason: 'Download is not active' }
    }
    if (isDirectVideoUrl(row.s3_hls_key)) {
      return { ok: false, reason: 'Pause is unavailable because this source cannot resume safely' }
    }
    pauseSignals.set(id, true)
    abortActiveRequests(id)
    db.prepare("UPDATE downloads SET status = 'paused', download_speed_kbps = 0 WHERE id = ?").run(id)
    notifyProgress(id, row.progress_percent, 'paused', row.completed_segments, row.total_segments, row.downloaded_bytes, row.total_bytes)
    return { ok: true }
  }))

  ipcMain.handle('download:resume', trustedIpcHandler((_event, rawId: unknown) => {
    const id = downloadIdSchema.parse(rawId)
    const changed = db.prepare(
      "UPDATE downloads SET status = 'pending', error_message = NULL WHERE id = ? AND status = 'paused'",
    ).run(id)
    if (changed.changes === 0) return { ok: false, reason: 'Download is not paused' }
    pauseSignals.delete(id)
    cancelSignals.delete(id)
    processQueue()
    return { ok: true }
  }))

  ipcMain.handle('download:cancel', trustedIpcHandler((_event, rawId: unknown) => {
    const id = downloadIdSchema.parse(rawId)
    pendingHlsPlans.delete(id)
    cancelSignals.set(id, true)
    abortActiveRequests(id)
    const row = db.prepare('SELECT local_dir FROM downloads WHERE id = ?')
      .get(id) as { local_dir: string } | undefined
    db.prepare("UPDATE downloads SET status = 'cancelled', error_message = NULL WHERE id = ?").run(id)
    notifyProgress(id, 0, 'cancelled')
    if (row) {
      setTimeout(() => {
        try { rmSync(row.local_dir, { recursive: true, force: true }) } catch { /* ignore */ }
        try { rmSync(row.local_dir + '.jpg', { force: true }) } catch { /* ignore */ }
        try { rmSync(row.local_dir + '.kokomovie.json', { force: true }) } catch { /* ignore */ }
        try { rmSync(row.local_dir + '.subtitles', { recursive: true, force: true }) } catch { /* ignore */ }
      }, 500)
    }
    return true
  }))

  ipcMain.handle('download:delete', trustedIpcHandler((_event, rawId: unknown) => {
    const id = downloadIdSchema.parse(rawId)
    pendingHlsPlans.delete(id)
    cancelSignals.set(id, true)
    abortActiveRequests(id)
    const row = db.prepare('SELECT local_dir FROM downloads WHERE id = ?')
      .get(id) as { local_dir: string } | undefined
    db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
    if (row) {
      setTimeout(() => {
        try { rmSync(row.local_dir, { recursive: true, force: true }) } catch { /* ignore */ }
        try { rmSync(row.local_dir + '.jpg', { force: true }) } catch { /* ignore */ }
        try { rmSync(row.local_dir + '.kokomovie.json', { force: true }) } catch { /* ignore */ }
        try { rmSync(row.local_dir + '.subtitles', { recursive: true, force: true }) } catch { /* ignore */ }
      }, 500)
    }
    return true
  }))


  ipcMain.handle('download:list', trustedIpcHandler(() => {
    const rows = db.prepare('SELECT * FROM downloads ORDER BY rowid DESC').all() as DownloadRow[]
    return rows.map((row) => ({
      ...row,
      thumbnail_url: row.thumbnail_url?.startsWith('offline:') ? withLocalMediaCapability(row.thumbnail_url) : row.thumbnail_url,
      can_pause: ['pending', 'downloading'].includes(row.status) && !isDirectVideoUrl(row.s3_hls_key),
    }))
  }))

  ipcMain.handle('download:get-manifest', trustedIpcHandler((_event, idInput: unknown) => {
    const id = downloadIdSchema.parse(idInput)
    const row = db.prepare('SELECT manifest_path, drm_key_id FROM downloads WHERE id = ? AND status = ?').get(id, 'completed') as { manifest_path: string; drm_key_id: string | null } | undefined
    if (!row?.manifest_path || !existsSync(row.manifest_path)) return null
    if (row.manifest_path.toLowerCase().endsWith('.mp4')) {
      return { manifestContent: 'direct:' + withLocalMediaCapability(`offline://${id}/video.mp4`), drmKeyId: null, subtitles: listOfflineSubtitles(id) }
    }
    return { manifestContent: decorateHlsManifestWithLocalCapability(readFileSync(row.manifest_path, 'utf-8')), drmKeyId: row.drm_key_id, subtitles: listOfflineSubtitles(id) }
  }))

  // Legacy shim — kept for any callers that still use the old API
  ipcMain.handle('download:queue', trustedIpcHandler(() =>
    db.prepare('SELECT * FROM downloads WHERE status IN (?,?) ORDER BY rowid').all('pending', 'downloading') as DownloadRow[],
  ))
  ipcMain.handle('download:segment', trustedIpcHandler(async () => {
    return { error: 'Use download:start instead' }
  }))

  // Directory selection & default downloads directory IPCs
  ipcMain.handle('dialog:select-directory', trustedIpcHandler(async () => {
    const windows = BrowserWindow.getAllWindows()
    const parentWindow = windows[0]
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return null
    return result.filePaths[0] ?? null
  }))

  ipcMain.handle('download:open-folder', trustedIpcHandler(async (_event, idInput?: unknown) => {
    const id = downloadIdSchema.optional().parse(idInput)
    const row = id ? db.prepare('SELECT local_dir FROM downloads WHERE id = ?').get(id) as { local_dir: string } | undefined : undefined
    const target = row?.local_dir ? dirname(row.local_dir) : join(app.getPath('userData'), 'downloads')
    mkdirSync(target, { recursive: true })
    const error = await shell.openPath(target)
    return { ok: !error, error: error || undefined }
  }))

  ipcMain.handle('download:get-default-dir', trustedIpcHandler(() => {
    return join(app.getPath('userData'), 'downloads')
  }))
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
  const range = parseByteRange(rangeHeader, totalSize)
  if (range.status === 416) {
    return { status: 416, headers: { 'Content-Range': range.contentRange ?? `bytes */${totalSize}` }, data: null }
  }
  const data = Buffer.allocUnsafe(range.length)
  const fd = openSync(filePath, 'r')
  try { readSync(fd, data, 0, range.length, range.start) } finally { closeSync(fd) }
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4', 'Content-Length': String(range.length), 'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  }
  if (range.contentRange) headers['Content-Range'] = range.contentRange
  return { status: range.status, headers, data }
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
    try { rmSync(row.local_dir + '.jpg', { force: true }) } catch { /* ignore */ }
    try { rmSync(row.local_dir + '.kokomovie.json', { force: true }) } catch { /* ignore */ }
    try { rmSync(row.local_dir + '.subtitles', { recursive: true, force: true }) } catch { /* ignore */ }
    db.prepare('DELETE FROM downloads WHERE id = ?').run(row.id)
  }

  if (expired.length > 0) {
    console.log(`[downloads] Purged ${expired.length} expired download(s)`)
  }
}
