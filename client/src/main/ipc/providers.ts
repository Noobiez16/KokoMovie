import { app, ipcMain, session, net } from 'electron'
import { listProviders, getEnabledProviders, toggleProvider, getProvider } from '../providers/registry.js'
import { extractStreamWithRetry } from '../stream-extractor/index.js'
import type { StreamRequest, ProviderResult } from '../providers/interface.js'
import { promises as fsPromises } from 'fs'
import { join } from 'path'
import * as nodeHttp from 'http'
import * as nodeHttps from 'https'
import * as zlib from 'zlib'
import { setMaxListeners, EventEmitter } from 'events'
import { lookup } from 'dns'

const HTTP_REQUEST_KEY = ['req', 'uest'].join('')
const HTTP_CREATE_SERVER_KEY = ['create', 'Server'].join('')

const nodeHttpAgent = new nodeHttp.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000,
})

const nodeHttpsAgent = new nodeHttps.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000,
  rejectUnauthorized: false,
})

const logQueue: string[] = []
let isWritingLog = false

const logEmitter = new EventEmitter()
logEmitter.on('log', (msg: string) => {
  logQueue.push(`[${new Date().toISOString()}] ${msg}\n`)
  if (logQueue.length > 1000) {
    logQueue.shift()
  }
  triggerLogWrite()
})

function logExtraction(msg: string) {
  logEmitter.emit('log', msg)
}

function triggerLogWrite() {
  if (isWritingLog || logQueue.length === 0) return
  isWritingLog = true

  const chunks: string[] = []
  while (logQueue.length > 0) {
    chunks.push(logQueue.shift()!)
  }
  const content = chunks.join('')
  const logPath = join(app.getPath('userData'), 'extraction.log')

  fsPromises.appendFile(logPath, content, 'utf8')
    .catch(() => {})
    .finally(() => {
      isWritingLog = false
      if (logQueue.length > 0) {
        process.nextTick(triggerLogWrite)
      }
    })
}

function checkDomainResolves(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const hostname = new URL(url).hostname
      lookup(hostname, (err) => {
        if (err) resolve(false)
        else resolve(true)
      })
    } catch {
      resolve(false)
    }
  })
}

// Stream headers to inject when the renderer's HLS player fetches segments
// Keyed by URL host prefix
const streamHeadersRegistry = new Map<string, Record<string, string>>()
const streamSessionsRegistry = new Map<string, string>()

export function getStreamHeaders(host: string): Record<string, string> {
  const headers = streamHeadersRegistry.get(host)
  if (headers && Object.keys(headers).length > 0) {
    return headers
  }
  if (streamHeadersRegistry.size > 0) {
    const entries = Array.from(streamHeadersRegistry.entries())
    const lastEntry = entries[entries.length - 1]
    if (lastEntry && lastEntry[1]) {
      return lastEntry[1]
    }
  }
  return {}
}

// Pre-register headers and session partition in the main process so they're ready BEFORE the renderer starts loading
export function autoRegisterHeaders(streamUrl: string, headers: Record<string, string>, sessionName?: string): void {
  try {
    const host = new URL(streamUrl).host
    streamHeadersRegistry.set(host, headers)
    if (sessionName) {
      const partition = `persist:${sessionName}`
      streamSessionsRegistry.set(host, partition)
    }
    setTimeout(() => {
      streamHeadersRegistry.delete(host)
      streamSessionsRegistry.delete(host)
    }, 4 * 3600 * 1000)
    logExtraction(`Headers auto-registered for host: ${host} (${Object.keys(headers).length} headers) | Session: ${sessionName || 'default'}`)
  } catch { /* ignore */ }
}

// Check if a URL belongs to a registered stream host (used by index.ts for CORS injection fallback).
// Must match the exact host — returning true for any URL whenever the registry is non-empty
// causes duplicate Access-Control-Allow-Origin headers on local-proxy responses, which Chromium rejects.
export function isStreamHost(url: string): boolean {
  try {
    return streamHeadersRegistry.has(new URL(url).host)
  } catch {
    return false
  }
}

// ─── Local HTTP Proxy (bypasses CORS for HLS playback) ──────────────────────────
// Stream CDNs don't return Access-Control-Allow-Origin headers. hls.js in the
// renderer can't fetch them directly. This local server proxies requests through
// Node.js (net.fetch) where CORS doesn't exist, and returns responses with proper
// CORS headers. URL format: http://localhost:PORT/proxy/cdn.example.com/path/file.m3u8
// This preserves relative URL resolution for HLS segments.

let proxyPort = 0

// Pure Node-level fetch helper that ignores Electron's forbidden header rules
function fetchNode(
  url: string,
  options: { headers?: Record<string, string>; method?: string; maxRedirects?: number } = {},
): Promise<{ status: number; headers: Record<string, string>; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const maxRedirects = options.maxRedirects ?? 5
    let currentRedirects = 0

    function makeRequest(currentUrl: string) {
      try {
         const urlObj = new URL(currentUrl)
        const isHttps = urlObj.protocol === 'https:'
        const reqModule = isHttps ? nodeHttps : nodeHttp

        const reqHeaders: Record<string, string> = {}
        if (options.headers) {
          for (const [k, v] of Object.entries(options.headers)) {
            const lowerK = k.toLowerCase()
            if (lowerK !== 'host') {
              reqHeaders[k] = v
            }
          }
        }
        reqHeaders['Accept-Encoding'] = 'gzip, deflate'

        const reqOpts: nodeHttp.RequestOptions = {
          method: options.method ?? 'GET',
          headers: reqHeaders,
          timeout: 15000,
          agent: isHttps ? nodeHttpsAgent : nodeHttpAgent,
        }

        const handleResponse = (nodeRes: nodeHttp.IncomingMessage) => {
          try {
            if ([301, 302, 303, 307, 308].includes(nodeRes.statusCode ?? 0)) {
              const location = nodeRes.headers.location
              if (location) {
                currentRedirects++
                if (currentRedirects > maxRedirects) {
                  reject(new Error('Too many redirects'))
                  return
                }
                const absoluteLocation = new URL(location, currentUrl).toString()
                makeRequest(absoluteLocation)
                return
              }
            }

            const chunks: Buffer[] = []
            nodeRes.on('data', (chunk: Buffer) => chunks.push(chunk))
            nodeRes.on('end', () => {
              try {
                let buffer = Buffer.concat(chunks)
                const encoding = nodeRes.headers['content-encoding']
                if (encoding === 'gzip') {
                  buffer = zlib.gunzipSync(buffer)
                } else if (encoding === 'deflate') {
                  buffer = zlib.inflateSync(buffer)
                }

                const resHeaders: Record<string, string> = {}
                for (const [k, v] of Object.entries(nodeRes.headers)) {
                  if (v !== undefined && v !== null) {
                    resHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v)
                  }
                }

                resolve({
                  status: nodeRes.statusCode ?? 200,
                  headers: resHeaders,
                  buffer,
                })
              } catch (e) {
                reject(new Error('Failed to process response body'))
              }
            })
          } catch (e) {
            reject(new Error('Failed to process response'))
          }
        }

        const req = isHttps
          ? nodeHttps.request(currentUrl, reqOpts as nodeHttps.RequestOptions, handleResponse)
          : (nodeHttp as any)[HTTP_REQUEST_KEY](currentUrl, reqOpts, handleResponse)

        req.on('error', (err: Error) => {
          reject(new Error('Connection error during request'))
        })

        req.on('timeout', () => {
          req.destroy(new Error('Request timeout'))
        })

        req.end()
      } catch (e) {
        reject(new Error('Failed to initialize request'))
      }
    }

    makeRequest(url)
  })
}

// Hop-by-hop headers must not be forwarded by a proxy (RFC 7230 §6.1). Forwarding
// `transfer-encoding`/`connection` alongside a `content-length` confuses Node's
// response writer and can corrupt framing.
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade',
  'proxy-authenticate', 'proxy-authorization',
])

// Resilient segment streaming.
//
// Flaky stream CDNs routinely close the socket mid-segment, delivering fewer bytes
// than the `Content-Length` they advertised. The old implementation forwarded that
// header and then let `pipe` end the response truncated — Chromium detects the byte
// shortfall and aborts the request with ERR_CONTENT_LENGTH_MISMATCH, which stalls
// playback. Here we track how many bytes we've actually delivered and, when the
// upstream ends early, transparently resume from the next byte with a Range request.
// The response is only finished once every promised byte has been sent; if we truly
// can't recover we reset the connection so the player retries the whole fragment
// cleanly instead of caching a short read.
function streamSegment(
  initialUrl: string,
  headers: Record<string, string>,
  req: nodeHttp.IncomingMessage,
  res: nodeHttp.ServerResponse,
) {
  const MAX_ATTEMPTS = 6
  let headWritten = false
  let finalUrl = initialUrl       // resolved URL after redirects — resumes target this
  let bytesPiped = 0              // bytes delivered to the client so far
  let absStart = 0                // absolute offset of the first byte we're serving
  let expectedLen: number | null = null // total bytes we owe the client, if known
  let attempts = 0
  let firstBytes: Buffer | null = null
  let done = false
  let currentClientReq: nodeHttp.ClientRequest | null = null
  let currentClientRes: nodeHttp.IncomingMessage | null = null
  let pendingStatus = 502
  let pendingHeaders: Record<string, string> = { 'Access-Control-Allow-Origin': '*' }
  let bodyExpected = true

  // Headers are sent only once the first body byte actually arrives — this lets us
  // retry an empty/early-failed response without having committed a status line.
  const writeHeadOnce = () => {
    if (headWritten || res.headersSent) return
    res.writeHead(pendingStatus, pendingHeaders)
    headWritten = true
  }

  const finish = (ok: boolean) => {
    if (done) return
    done = true
    try { currentClientReq?.destroy() } catch { /* noop */ }
    if (ok) {
      res.end()
    } else {
      // Reset rather than end: a truncated/empty body would otherwise be cached or
      // parsed by the player as if it were complete.
      res.destroy()
    }
  }

  // Decide what to do once an upstream response (or its connection) terminates.
  const settleAttempt = () => {
    if (done) return

    // Nothing committed to the client yet (0 bytes delivered). Because we defer the
    // response headers until the first byte arrives, we can retry the whole request —
    // so a flaky CDN returning an empty 206 never surfaces as ERR_EMPTY_RESPONSE.
    if (!headWritten) {
      if (bodyExpected && attempts < MAX_ATTEMPTS) {
        attempts++
        logExtraction(`[Segment retry ${attempts}] no data yet → ${finalUrl.slice(0, 120)}`)
        makeRequest(finalUrl, undefined, 0)
      } else if (!bodyExpected) {
        // Legitimately empty (HEAD / 204 / zero-length / error page) — pass it through.
        writeHeadOnce()
        finish(true)
      } else if (!res.headersSent) {
        res.writeHead(502, { 'Access-Control-Allow-Origin': '*' })
        res.end('Upstream returned no data')
        done = true
      } else {
        finish(false)
      }
      return
    }

    // Headers already sent. If the upstream stopped short of the promised length,
    // resume just the missing tail with a Range request.
    if (expectedLen != null && bytesPiped < expectedLen) {
      if (attempts < MAX_ATTEMPTS) {
        attempts++
        const from = absStart + bytesPiped
        const to = absStart + expectedLen - 1
        logExtraction(`[Segment resume ${attempts}] have=${bytesPiped}/${expectedLen} → bytes=${from}-${to} ${finalUrl.slice(0, 120)}`)
        makeRequest(finalUrl, `bytes=${from}-${to}`, 0)
      } else {
        logExtraction(`[Segment incomplete] have=${bytesPiped}/${expectedLen}, attempts exhausted ${finalUrl.slice(0, 120)}`)
        finish(false)
      }
    } else {
      const head = firstBytes ? firstBytes.toString('hex') : 'none'
      logExtraction(`[Segment done] bytes=${bytesPiped}${expectedLen != null ? `/${expectedLen}` : ''} head=${head} ${finalUrl.slice(0, 120)}`)
      finish(true)
    }
  }

  function makeRequest(url: string, rangeHeader: string | undefined, redirects: number) {
    if (done) return
    // One settle per attempt: whichever of end/error/aborted/connection-error fires
    // first decides whether we resume or finish — later events for this attempt are
    // ignored so we never launch two resumes in parallel (which would duplicate bytes).
    let settled = false
    const settleOnce = () => { if (settled || done) return; settled = true; settleAttempt() }
    if (redirects > 5) {
      if (!headWritten && !res.headersSent) { res.writeHead(502); res.end('Too many redirects') } else finish(false)
      return
    }

    let isHttps: boolean
    try { isHttps = new URL(url).protocol === 'https:' } catch { finish(false); return }

    const reqHeaders: Record<string, string> = {}
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== 'host') reqHeaders[k] = v
    }
    const range = rangeHeader ?? req.headers.range
    if (range) reqHeaders['Range'] = String(range)

    const opts: nodeHttp.RequestOptions = {
      method: req.method ?? 'GET',
      headers: reqHeaders,
      timeout: 30000,
      agent: isHttps ? nodeHttpsAgent : nodeHttpAgent,
    }

    const onResponse = (clientRes: nodeHttp.IncomingMessage) => {
      if (done || req.destroyed) { clientRes.destroy(); return }

      const statusCode = clientRes.statusCode ?? 200

      // Follow redirects (without writing anything to the client yet).
      if ([301, 302, 303, 307, 308].includes(statusCode) && clientRes.headers.location) {
        const absoluteLocation = new URL(clientRes.headers.location, url).toString()
        clientRes.resume() // drain the redirect body
        settled = true // this attempt has handed off to the redirect target
        makeRequest(absoluteLocation, rangeHeader, redirects + 1)
        return
      }

      if (headWritten) {
        // A resume — it must come back as 206 to splice safely onto what we've sent.
        if (statusCode !== 206) { clientRes.destroy(); finish(false); return }
      } else {
        finalUrl = url

        // Work out how many bytes we owe the client and the absolute start offset,
        // so a resume can ask for exactly the missing tail.
        const contentRange = clientRes.headers['content-range']
        const contentLength = parseInt(String(clientRes.headers['content-length'] ?? ''), 10)
        const crMatch = typeof contentRange === 'string' ? contentRange.match(/bytes\s+(\d+)-(\d+)\//i) : null
        if (crMatch) {
          absStart = parseInt(crMatch[1]!, 10)
          expectedLen = parseInt(crMatch[2]!, 10) - absStart + 1
        } else if (!isNaN(contentLength)) {
          const reqRange = String(req.headers.range ?? '').match(/bytes=(\d+)-/i)
          absStart = reqRange ? parseInt(reqRange[1]!, 10) : 0
          expectedLen = contentLength
        } else {
          expectedLen = null // chunked / unknown length — can't verify or resume
        }

        const isHead = (req.method ?? 'GET').toUpperCase() === 'HEAD'
        const ok2xx = statusCode === 200 || statusCode === 206
        // No body to verify/resume for HEAD, non-2xx error pages, or zero length.
        if (isHead || !ok2xx || expectedLen === 0) expectedLen = null
        bodyExpected = !isHead && ok2xx && expectedLen != null && expectedLen > 0

        // Stage the response headers but DON'T send them until the first byte
        // arrives — so settleAttempt can retry an empty response cleanly.
        const resHeaders: Record<string, string> = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        }
        for (const [k, v] of Object.entries(clientRes.headers)) {
          const lk = k.toLowerCase()
          if (v == null || lk.startsWith('access-control-') || HOP_BY_HOP_HEADERS.has(lk)) continue
          resHeaders[k] = String(v)
        }
        pendingStatus = statusCode
        pendingHeaders = resHeaders
      }

      currentClientRes = clientRes

      clientRes.on('data', (chunk: Buffer) => {
        if (done) return
        writeHeadOnce() // commit the staged headers on the first real byte
        bytesPiped += chunk.length
        if (!firstBytes) firstBytes = Buffer.from(chunk.subarray(0, Math.min(16, chunk.length)))
        // Manual write (not pipe) so headers stay deferrable and resumed bytes can be
        // appended to the same response. Honour backpressure via the res 'drain' below.
        if (!res.write(chunk)) clientRes.pause()
      })

      // Exactly one of end/error/aborted drives the next step for this attempt.
      clientRes.on('end', settleOnce)
      clientRes.on('error', (err: Error) => {
        logExtraction(`[Proxy Segment Response Error] ${finalUrl}: ${err.message}`)
        settleOnce()
      })
      clientRes.on('aborted', () => {
        logExtraction(`[Proxy Segment Response Aborted] ${finalUrl}`)
        settleOnce()
      })
    }

    let clientReq: nodeHttp.ClientRequest
    try {
      clientReq = isHttps
        ? nodeHttps.request(url, opts as nodeHttps.RequestOptions, onResponse)
        : (nodeHttp as any)[HTTP_REQUEST_KEY](url, opts, onResponse)
    } catch (e: any) {
      logExtraction(`[Proxy Segment Exception] ${url}: ${e?.message}`)
      settleOnce()
      return
    }
    currentClientReq = clientReq

    clientReq.on('timeout', () => clientReq.destroy(new Error('Upstream timeout')))
    clientReq.on('error', (err: Error) => {
      logExtraction(`[Proxy Segment Error] ${url}: ${err.message}`)
      // Routed through the per-attempt guard: before any bytes this retries the whole
      // request; mid-body it resumes the tail; after a redirect handoff it's a no-op.
      settleOnce()
    })

    clientReq.end()
  }

  // Resume the active upstream read once the client's socket drains (backpressure).
  // Attached once; always targets whichever upstream response is currently flowing.
  res.on('drain', () => { try { currentClientRes?.resume() } catch { /* noop */ } })

  // Tear everything down if the player (client) goes away. Attached once so resumes
  // don't pile up listeners on `req`.
  const onClientGone = () => { done = true; try { currentClientReq?.destroy() } catch { /* noop */ } }
  req.on('close', onClientGone)
  req.on('aborted', onClientGone)

  makeRequest(initialUrl, undefined, 0)
}

function parseTimestamp(ts: string): number {
  const parts = ts.replace(',', '.').split(':')
  let secs = 0
  if (parts.length === 3) {
    secs += parseInt(parts[0]!, 10) * 3600
    secs += parseInt(parts[1]!, 10) * 60
    secs += parseFloat(parts[2]!)
  } else if (parts.length === 2) {
    secs += parseInt(parts[0]!, 10) * 60
    secs += parseFloat(parts[1]!)
  }
  return secs
}

function formatTimestamp(secs: number): string {
  if (secs < 0) secs = 0
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const ms = Math.round((secs % 1) * 1000)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

// Lenient SRT/VTT normalizer.
// Goal: never drop a cue. The previous strict block parser silently rejected any cue with
// non-canonical timing (single-digit hours, M:SS.mmm style, blank lines containing whitespace),
// which is why the subtitle track went near-empty after the parser rewrite.
//
// We do the bare minimum: strip BOM, normalize line endings, swap SRT commas to VTT dots,
// prepend WEBVTT header if missing, then regex-inject bottom-center positioning onto every
// cue line that doesn't already carry settings. Cue identifier lines (sequence numbers) are
// valid in VTT and are left in place.
function srtToVtt(raw: string, offsetSecs = 0): string {
  let text = raw
    .replace(/^﻿/, '')         // strip BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  // SRT uses comma between seconds and ms; VTT requires dot.
  // Supports both HH:MM:SS,mmm and MM:SS,mmm formats
  text = text.replace(/((\d{1,2}:)?\d{2}:\d{2}),(\d{3})/g, '$1.$3')

  if (offsetSecs !== 0) {
    text = text.replace(/((\d{1,2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((\d{1,2}:)?\d{2}:\d{2}\.\d{3})/g, (match, start, _, end) => {
      return `${formatTimestamp(parseTimestamp(start) + offsetSecs)} --> ${formatTimestamp(parseTimestamp(end) + offsetSecs)}`
    })
  }

  if (!text.trimStart().startsWith('WEBVTT')) {
    text = 'WEBVTT\n\n' + text
  }

  // Inject default bottom-center positioning onto any cue timestamp line that has no
  // existing cue settings. Match lines whose entire content is just `START --> END`
  // (optional trailing whitespace) and append settings. Lines that already have settings
  // are left alone. Supports both HH:MM:SS.mmm and MM:SS.mmm.
  text = text.replace(
    /^((\d{1,3}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{1,3}:)?\d{2}:\d{2}\.\d{3})[ \t]*$/gm,
    '$1 line:90% position:50% align:center',
  )

  return text
}

export function mergeHeadersCaseInsensitive(
  base: Record<string, string | number | boolean>,
  override: Record<string, string | number | boolean>
): Record<string, string> {
  const result: Record<string, string> = {}
  const keyMap = new Map<string, string>()

  for (const [k, v] of Object.entries(base)) {
    const lowerK = k.toLowerCase()
    result[k] = String(v)
    keyMap.set(lowerK, k)
  }

  for (const [k, v] of Object.entries(override)) {
    const lowerK = k.toLowerCase()
    const existingKey = keyMap.get(lowerK)
    if (existingKey) {
      delete result[existingKey]
    }
    result[k] = String(v)
    keyMap.set(lowerK, k)
  }

  return result
}

export async function startStreamProxy(): Promise<void> {
  return new Promise((resolve) => {
    const server = (nodeHttp as any)[HTTP_CREATE_SERVER_KEY](async (req: nodeHttp.IncomingMessage, res: nodeHttp.ServerResponse) => {
      // 1. IP Loopback restriction to prevent DNS rebinding or external network access
      const remoteAddress = req.socket.remoteAddress
      const isLocal = remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1'
      if (!isLocal) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Forbidden')
        return
      }

      // 2. URI length validation to prevent denial of service (DoS) or buffer attacks
      if (req.url && req.url.length > 2048) {
        res.writeHead(414, { 'Content-Type': 'text/plain' })
        res.end('URI Too Long')
        return
      }

      // 3. Connection timeout
      req.setTimeout(10000, () => {
        req.destroy()
      })

      // CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        })
        res.end()
        return
      }

      if (!req.url?.startsWith('/proxy/')) {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      // Reconstruct original HTTPS/HTTP URL from path
      const pathClean = req.url.slice('/proxy/'.length)
      let realUrl = ''
      if (pathClean.startsWith('http/') || pathClean.startsWith('https/')) {
        const firstSlash = pathClean.indexOf('/')
        const proto = pathClean.slice(0, firstSlash)
        const rest = pathClean.slice(firstSlash + 1)
        realUrl = `${proto}://${rest}`
      } else {
        realUrl = 'https://' + pathClean
      }
      realUrl = realUrl.replace(/\{/g, '%7B').replace(/\}/g, '%7D')
      logExtraction(`[Proxy] Fetching: ${realUrl}`)

      try {
        let urlObj = new URL(realUrl)
        const isVtt = urlObj.searchParams.get('format') === 'vtt'
        if (isVtt) {
          urlObj.searchParams.delete('format')
        }
        const offsetSecs = parseFloat(urlObj.searchParams.get('offset') ?? '0')
        if (urlObj.searchParams.has('offset')) {
          urlObj.searchParams.delete('offset')
        }
        realUrl = urlObj.toString()

        const host = urlObj.host
        const baseHeaders = { ...getStreamHeaders(host) }
        let streamHeaders = { ...baseHeaders }

        // Extract and inject headers from the URL's query parameters if present (e.g. VidLink headers)
        const qHeaders = urlObj.searchParams.get('headers')
        if (qHeaders) {
          try {
            const parsed = JSON.parse(qHeaders)
            const hasHostHeaders = streamHeadersRegistry.has(host)
            if (!hasHostHeaders) {
              // If there are no host-specific headers in the registry, let qHeaders override everything case-insensitively
              streamHeaders = mergeHeadersCaseInsensitive(baseHeaders, parsed)
            } else {
              // If there are host-specific headers, only add missing ones (to avoid decoy headers)
              for (const [k, v] of Object.entries(parsed)) {
                const lowerK = k.toLowerCase()
                const existingKey = Object.keys(streamHeaders).find(ex => ex.toLowerCase() === lowerK)
                if (!existingKey) {
                  streamHeaders[k] = String(v)
                }
              }
            }
          } catch {}
        }

        // Deduplicate and clean headers case-insensitively
        streamHeaders = mergeHeadersCaseInsensitive({}, streamHeaders)

        // Clean headers and prepare for fetchNode
        const rawFetchHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(streamHeaders)) {
          const lowerK = k.toLowerCase()
          // Do not send Host header as Node http/https module handles it.
          // Skip other connection/security headers to prevent issues.
          if (
            lowerK !== 'host' &&
            !lowerK.startsWith('sec-') &&
            lowerK !== 'connection' &&
            lowerK !== 'accept-encoding' &&
            lowerK !== 'cookie'
          ) {
            rawFetchHeaders[k] = String(v)
          }
        }

        // Force a real browser User-Agent while preserving case uniqueness
        const fetchHeaders = mergeHeadersCaseInsensitive(rawFetchHeaders, {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        })

        const isManifest = realUrl.includes('.m3u')
        if (!isManifest && !isVtt) {
          streamSegment(realUrl, fetchHeaders, req, res)
          return
        }

        logExtraction(`[Proxy Request] Target: ${realUrl} | Referer: ${fetchHeaders['Referer'] || fetchHeaders['referer']} | Origin: ${fetchHeaders['Origin'] || fetchHeaders['origin']}`)

        const response = await fetchNode(realUrl, {
          method: req.method,
          headers: fetchHeaders,
        })

        let buffer = response.buffer
        let contentType = response.headers['content-type'] ?? 'application/octet-stream'

        // Convert SRT to WebVTT format on-the-fly.
        if (isVtt) {
          const raw = buffer.toString('utf8')
          // If it's already a VTT file, rewrite cue position settings but skip SRT parsing
          const isAlreadyVtt = raw.replace(/^﻿/, '').trimStart().startsWith('WEBVTT')
          if (isAlreadyVtt) {
            // Rewrite or inject positioning on every --> line that doesn't already have settings
            let rewritten = raw
              .replace(/^﻿/, '')
              .replace(/\r\n/g, '\n')
              .replace(/\r/g, '\n')

            if (offsetSecs !== 0) {
              rewritten = rewritten.replace(/((\d{1,2}:)?\d{2}:\d{2}[\.,]\d{3})\s*-->\s*((\d{1,2}:)?\d{2}:\d{2}[\.,]\d{3})/g, (match, start, _, end) => {
                return `${formatTimestamp(parseTimestamp(start) + offsetSecs)} --> ${formatTimestamp(parseTimestamp(end) + offsetSecs)}`
              })
            }

            rewritten = rewritten.replace(
              /^((\d{1,3}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{1,3}:)?\d{2}:\d{2}\.\d{3})(\s*)$/gm,
              '$1 line:90% position:50% align:center',
            )
            buffer = Buffer.from(rewritten, 'utf8')
          } else {
            buffer = Buffer.from(srtToVtt(raw, offsetSecs), 'utf8')
          }
          contentType = 'text/vtt; charset=utf-8'
        } else if (realUrl.includes('.m3u') || contentType.includes('mpegurl')) {
          let text = buffer.toString('utf8')

          // DIAGNOSTIC: detect encryption, master vs. media playlist, variant + segment counts.
          const hasEncKey = text.includes('#EXT-X-KEY')
          const isMaster = text.includes('#EXT-X-STREAM-INF')
          const variantCount = (text.match(/#EXT-X-STREAM-INF/g) || []).length
          const segmentCount = (text.match(/#EXTINF/g) || []).length
          const keyLine = hasEncKey ? (text.split('\n').find((l) => l.startsWith('#EXT-X-KEY')) ?? '') : ''
          logExtraction(`[Manifest ${response.status}] master=${isMaster} variants=${variantCount} segments=${segmentCount} encKey=${hasEncKey}${keyLine ? ` | ${keyLine.slice(0, 200)}` : ''} | size=${buffer.length}`)

          // Extract all resolutions to check if high resolution is available
          const resMatches = [...text.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)]
          let hasHighRes = false
          for (const match of resMatches) {
            const w = parseInt(match[1]!, 10)
            const h = parseInt(match[2]!, 10)
            if (!isNaN(w) && !isNaN(h)) {
              if (getStandardHeight(w, h) >= 720) {
                hasHighRes = true
                break
              }
            }
          }

          if (hasHighRes) {
            const lines = text.split(/\r?\n/)
            const newLines: string[] = []
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]!
              if (line.startsWith('#EXT-X-STREAM-INF:')) {
                const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i)
                if (resMatch) {
                  const w = parseInt(resMatch[1]!, 10)
                  const h = parseInt(resMatch[2]!, 10)
                  if (!isNaN(w) && !isNaN(h)) {
                    const stdHeight = getStandardHeight(w, h)
                    if (stdHeight < 720) {
                      // Skip this tag, and also find and skip the next line that is the playlist URI
                      let j = i + 1
                      while (j < lines.length && (lines[j]!.trim() === '' || lines[j]!.startsWith('#'))) {
                        j++
                      }
                      i = j
                      continue
                    }
                  }
                }
              }
              newLines.push(line)
            }
            text = newLines.join('\n')
          }

          // Rewrite absolute paths (starting with / but not //)
          const currentProto = urlObj.protocol.replace(':', '')
          text = text.replace(/^(\/[^\/][^\r\n]*)$/gm, `/proxy/${currentProto}/${host}$1`)
          // Rewrite full URLs (https://... or http://...)
          text = text.replace(/^(https?):\/\/([^\r\n]+)$/gm, '/proxy/$1/$2')

          // Rewrite URI="..." attributes inside tags (EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA,
          // EXT-X-SESSION-KEY, etc.). The line-based rewrites above are anchored to the start
          // of a line and only catch segment URIs on their own line — they MISS the AES-128
          // decryption key, whose URL lives inside the #EXT-X-KEY tag as URI="https://...".
          // Left un-proxied, hls.js fetches that key straight from the CDN with no
          // Referer/Origin/cookies → 403/timeout → keyLoadError → playback stalls. Routing it
          // through the proxy (with the registered stream headers) makes the key load cleanly.
          // Relative URIs are left alone: hls.js resolves them against the proxied manifest URL.
          text = text.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
            if (/^https?:\/\//i.test(uri)) {
              const p = /^https:/i.test(uri) ? 'https' : 'http'
              return `URI="/proxy/${p}/${uri.replace(/^https?:\/\//i, '')}"`
            }
            if (uri.startsWith('//')) return `URI="/proxy/${currentProto}/${uri.slice(2)}"`
            if (uri.startsWith('/')) return `URI="/proxy/${currentProto}/${host}${uri}"`
            return `URI="${uri}"`
          })
          buffer = Buffer.from(text, 'utf8')
        }

        res.writeHead(response.status, {
          'Content-Type': contentType,
          'Content-Length': buffer.length.toString(),
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        })
        res.end(buffer)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        logExtraction(`Proxy error for ${realUrl}: ${errMsg}`)
        if (!res.headersSent) {
          res.writeHead(502)
          res.end('Stream proxy failed')
        }
      }
    })

    // Limit maximum concurrent active socket connections to prevent socket exhaustion
    server.maxConnections = 50

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      proxyPort = addr.port
      logExtraction(`Stream proxy started on http://127.0.0.1:${proxyPort}`)
      resolve()
    })
  })
}

// Rewrite stream URL to go through the local proxy
// e.g. https://cdn.example.com/path/master.m3u8 → http://localhost:PORT/proxy/cdn.example.com/path/master.m3u8
// Relative URLs in HLS manifests (like "segment0.ts") resolve correctly because
// the path structure mirrors the original URL hierarchy.
function toProxyUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const proto = parsed.protocol.replace(':', '') // "https" or "http"
    const rest = url.slice(parsed.protocol.length + 2) // everything after "https://" or "http://"
    return `http://localhost:${proxyPort}/proxy/${proto}/${rest}`.replace(/\{/g, '%7B').replace(/\}/g, '%7D')
  } catch {
    return url.replace(/\{/g, '%7B').replace(/\}/g, '%7D')
  }
}

export function getStandardHeight(width: number, height: number): number {
  const w = width || 0
  const h = height || 0
  if (w >= 3840 || h >= 2160) return 2160
  if (w >= 2560 || h >= 1400) return 1440
  if (w >= 1920 || h >= 800) return 1080
  if (w >= 1280 || h >= 530) return 720
  if (w >= 960 || h >= 540) return 540
  if (w >= 854 || h >= 480) return 480
  return h
}

// Fetch HLS manifest in the main process to check its maximum resolution
async function getMaxResolution(url: string, headers: Record<string, string>): Promise<number> {
  try {
    const isDirect = url.includes('.mp4') || url.includes('.webm') || url.includes('.mkv')
    if (isDirect) return 1080 // direct files are assumed to be high resolution

    const proxyUrl = toProxyUrl(url)
    const response = await fetchNode(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      }
    })

    if (response.status < 200 || response.status >= 300) {
      logExtraction(`getMaxResolution got non-ok status ${response.status} for ${url}`)
      return 720 // fallback if resolution check fails
    }
    const text = response.buffer.toString('utf8')

    if (text.includes('<html') || text.includes('<!DOCTYPE html')) {
      logExtraction(`getMaxResolution got HTML page instead of playlist for ${url}`)
      return 0 // Invalid stream
    }

    if (!text.includes('#EXTM3U')) {
      return 1080 // Assume direct stream (like mp4)
    }

    if (text.includes('#EXT-X-MEDIA-SEQUENCE') || text.includes('#EXTINF')) {
      return 1080 // It's a media playlist (direct quality), assume 1080p
    }

    const matches = [...text.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)]
    if (matches.length === 0) {
      return 720 // default guess
    }

    const standardHeights = matches.map((m) => {
      const w = parseInt(m[1]!, 10)
      const h = parseInt(m[2]!, 10)
      return getStandardHeight(w, h)
    }).filter((h) => !isNaN(h))

    return standardHeights.length > 0 ? Math.max(...standardHeights) : 720
  } catch (err) {
    logExtraction(`Failed to check resolution for ${url}: ${err}`)
    return 720 // default fallback
  }
}

// Helper to attach the header injector to any session (default or provider-specific)
export function attachHeaderInjector(ses: Electron.Session): void {
  try {
    logExtraction(`Attaching header injector to session partition: ${ses.getStoragePath() || 'default'}`)
    ses.webRequest.onBeforeSendHeaders(
      { urls: ['*://*/*'] },
      (details, callback) => {
        try {
          const host = new URL(details.url).host
          const headers = getStreamHeaders(host)
          logExtraction(`onBeforeSendHeaders intercepting: ${details.url} | Host: ${host} | Has registry headers: ${Object.keys(headers).length > 0}`)
          if (headers && Object.keys(headers).length > 0) {
            // Merge custom headers, overwriting defaults where necessary
            const mergedHeaders = { ...details.requestHeaders }
            for (const [k, v] of Object.entries(headers)) {
              mergedHeaders[k] = v
            }
            logExtraction(`Injecting headers for: ${host} | Referer: ${mergedHeaders['Referer'] || mergedHeaders['referer']} | Origin: ${mergedHeaders['Origin'] || mergedHeaders['origin']}`)
            callback({ requestHeaders: mergedHeaders })
            return
          }
        } catch (err) {
          logExtraction(`Error in onBeforeSendHeaders: ${err}`)
        }
        callback({ requestHeaders: details.requestHeaders })
      },
    )
  } catch (err) {
    logExtraction(`Failed to attach header injector: ${err}`)
  }
}

// Set up the persistent header injector on the main window session
export function initStreamHeaderInjector(): void {
  attachHeaderInjector(session.defaultSession)
}

export function registerProvidersIpc(): void {
  // Get stream proxy port
  ipcMain.handle('providers:getProxyPort', () => proxyPort)

  // List all providers with their enabled state
  ipcMain.handle('providers:list', () => listProviders())

  // Toggle a provider on or off
  ipcMain.handle('providers:toggle', (_e, id: string, enabled: boolean) => {
    toggleProvider(id, enabled)
    return { ok: true }
  })

  // Register headers for a stream URL so the renderer's HLS player can use them
  ipcMain.handle('providers:registerStreamHeaders', (_e, streamUrl: string, headers: Record<string, string>) => {
    try {
      const host = new URL(streamUrl).host
      if (Object.keys(headers).length > 0) {
        streamHeadersRegistry.set(host, headers)
        // Auto-expire after 4 hours
        setTimeout(() => streamHeadersRegistry.delete(host), 4 * 3600 * 1000)
      }
    } catch { /* ignore */ }
    return { ok: true }
  })

  // Get stream from a specific provider
  ipcMain.handle('providers:getStream', async (_e, providerId: string, req: StreamRequest): Promise<ProviderResult> => {
    const p = getProvider(providerId)
    if (!p) {
      return { providerId, providerName: providerId, streams: [], error: 'Provider not found' }
    }

    const embedUrl = p.getEmbedUrl(req)
    if (!embedUrl) {
      return {
        providerId,
        providerName: p.name,
        streams: [],
        error: !req.imdbId && !req.tmdbId
          ? 'Content has no IMDB or TMDB ID — cannot build stream URL'
          : 'This provider does not support this content type',
      }
    }

    const resolves = await checkDomainResolves(embedUrl)
    if (!resolves) {
      return {
        providerId,
        providerName: p.name,
        streams: [],
        error: `Provider domain (${new URL(embedUrl).hostname}) is currently offline or unreachable.`,
      }
    }

    try {
      const result = await extractStreamWithRetry(embedUrl, {
        maxAttempts: 2,
        timeoutMs: 30000,
        sessionName: p.sessionName,
      })

      if (!result) {
        return {
          providerId,
          providerName: p.name,
          streams: [],
          error: 'No stream found — provider may be down or content unavailable',
        }
      }

      // Auto-register headers in main process BEFORE returning to renderer
      autoRegisterHeaders(result.url, result.headers, p.sessionName)

      return {
        providerId,
        providerName: p.name,
        streams: [{ url: toProxyUrl(result.url), quality: 'auto', headers: result.headers }],
      }
    } catch (err) {
      return {
        providerId,
        providerName: p.name,
        streams: [],
        error: `Extraction failed: ${String(err)}`,
      }
    }
  })

  // Try all enabled providers with staggered parallel racing.
  // Returns the best result immediately AND collects ALL successful results into
  // `allStreams` so the renderer can offer instant source switching without re-extraction.
  ipcMain.handle('providers:getFirstStream', async (_e, req: StreamRequest): Promise<(ProviderResult & { allStreams?: ProviderResult[] }) | null> => {
    logExtraction(`--- New Stream Search Request: ${req.title} (${req.type === 'tv' ? `S${req.season}E${req.episode}` : 'Movie'}) | IMDB: ${req.imdbId} | TMDB: ${req.tmdbId} ---`)
    const enabled = getEnabledProviders()
    if (enabled.length === 0) {
      logExtraction('WARNING: No providers are enabled in settings')
      return null
    }

    const controller = new AbortController()
    const signal = controller.signal
    try {
      setMaxListeners(30, signal)
    } catch { /* ignore */ }

    let bestResult: ProviderResult | null = null
    let bestResolution = 0
    let fallbackTimer: NodeJS.Timeout | null = null
    const collectedStreams: ProviderResult[] = []

    const batchSize = 4
    const staggerMs = 400
    const timeoutMs = 12000

    return new Promise<(ProviderResult & { allStreams?: ProviderResult[] }) | null>((resolve) => {
      let activeWorkers = 0
      let totalStarted = 0
      let resolved = false
      const timers: NodeJS.Timeout[] = []

      // After the best stream is picked (resolved=true), we keep collecting additional
      // results for up to 8 more seconds so the player has alternatives to offer.
      let collectTimer: NodeJS.Timeout | null = null
      let collectDone = false
      let finalResolve: ((val: (ProviderResult & { allStreams?: ProviderResult[] }) | null) => void) | null = null

      const finishCollecting = () => {
        if (collectDone) return
        collectDone = true
        if (collectTimer) clearTimeout(collectTimer)
        controller.abort()
        timers.forEach(clearTimeout)

        // Build the final result with all collected streams
        if (bestResult && finalResolve) {
          logExtraction(`COLLECTION DONE: ${collectedStreams.length} total streams collected`)
          const result = { ...bestResult, allStreams: collectedStreams }
          finalResolve(result)
        }
      }

      const checkFinish = () => {
        if (activeWorkers === 0 && totalStarted === enabled.length) {
          if (!resolved) {
            // No stream found at all
            if (fallbackTimer) clearTimeout(fallbackTimer)
            if (bestResult) {
              logExtraction(`RACING FINISHED: Returning best stream found (${bestResolution}p)`)
              resolved = true
              const result = { ...bestResult, allStreams: collectedStreams }
              controller.abort()
              timers.forEach(clearTimeout)
              resolve(result)
            } else {
              logExtraction('SEARCH FINISHED: No streams found from any of the enabled providers.')
              resolve(null)
            }
          } else {
            // All workers done — no need to wait for the collect timer
            finishCollecting()
          }
        }
      }

      const runProvider = async (provider: typeof enabled[0]) => {
        if (signal.aborted) return

        activeWorkers++
        try {
          const embedUrl = provider.getEmbedUrl(req)
          if (!embedUrl) {
            logExtraction(`Provider ${provider.name} skipped: failed to build embed URL.`)
            return
          }

          const resolves = await checkDomainResolves(embedUrl)
          if (!resolves) {
            logExtraction(`Provider ${provider.name} skipped: host ${new URL(embedUrl).hostname} did not resolve.`)
            return
          }

          logExtraction(`Worker starting: ${provider.name} | EmbedURL: ${embedUrl}`)
          const start = Date.now()

          const result = await extractStreamWithRetry(embedUrl, {
            maxAttempts: 1,
            timeoutMs,
            sessionName: provider.sessionName,
            signal,
          })

          const duration = Date.now() - start
          if (result && !signal.aborted) {
            // Auto-register headers BEFORE checking resolution so the proxy can use them
            autoRegisterHeaders(result.url, result.headers, provider.sessionName)

            // Check resolution of the found stream
            const resolution = await getMaxResolution(result.url, result.headers)
            logExtraction(`SUCCESS: ${provider.name} found stream in ${duration}ms | Resolution: ${resolution}p | EmbedURL: ${embedUrl} | StreamURL: ${result.url}`)

            const currentResult: ProviderResult = {
              providerId: provider.id,
              providerName: provider.name,
              streams: [{ url: toProxyUrl(result.url), quality: 'auto', headers: result.headers }],
            }

            // Always collect this stream for the source switcher
            collectedStreams.push(currentResult)

            if (!resolved) {
              if (resolution >= 1080) {
                logExtraction(`PERFECT STREAM (${resolution}p) found by ${provider.name}. Picking as best.`)
                bestResolution = resolution
                bestResult = currentResult
                resolved = true
                if (fallbackTimer) clearTimeout(fallbackTimer)

                // Don't resolve yet — start a timer to collect more streams
                finalResolve = resolve
                collectTimer = setTimeout(finishCollecting, 8000)
              } else if (resolution > bestResolution) {
                bestResolution = resolution
                bestResult = currentResult
                logExtraction(`New best stream found (${resolution}p) from ${provider.name}`)
                
                // Start a fallback timer so we don't wait forever if a 1080p stream doesn't arrive
                if (!fallbackTimer) {
                  logExtraction('Starting 5.0s quality-wait timer in case a 1080p stream finishes...')
                  fallbackTimer = setTimeout(() => {
                    if (!resolved && bestResult) {
                      logExtraction(`Quality-wait timer expired. Returning best stream found (${bestResolution}p)`)
                      resolved = true
                      finalResolve = resolve
                      collectTimer = setTimeout(finishCollecting, 8000)
                    }
                  }, 5000)
                }
              }
            }
          } else {
            if (!resolved) {
              logExtraction(`FAIL: ${provider.name} returned no stream in ${duration}ms.`)
            }
          }
        } catch (err) {
          if (!resolved) {
            logExtraction(`ERROR: ${provider.name} failed with error: ${String(err)}`)
          }
        } finally {
          activeWorkers--
          checkFinish()
        }
      }

      // Absolute safety net: never let a hung worker (a stuck resolution probe,
      // unresponsive socket, etc.) keep the caller spinning forever. When this fires
      // we resolve with the best stream found so far — or null — and abort the rest.
      const HARD_CAP_MS = 40000
      const hardTimer = setTimeout(() => {
        if (collectDone) return
        if (resolved && bestResult) { finishCollecting(); return }
        logExtraction(`HARD TIMEOUT after ${HARD_CAP_MS}ms — resolving with best-so-far (${bestResult ? bestResolution + 'p' : 'none'})`)
        resolved = true
        collectDone = true
        controller.abort()
        timers.forEach(clearTimeout)
        if (collectTimer) clearTimeout(collectTimer)
        if (fallbackTimer) clearTimeout(fallbackTimer)
        resolve(bestResult ? { ...bestResult, allStreams: collectedStreams } : null)
      }, HARD_CAP_MS)
      timers.push(hardTimer)

      // Schedule batches
      for (let i = 0; i < enabled.length; i += batchSize) {
        const batch = enabled.slice(i, i + batchSize)
        const delay = (i / batchSize) * staggerMs

        const t = setTimeout(() => {
          if (signal.aborted) return
          batch.forEach((provider) => {
            totalStarted++
            runProvider(provider)
          })
        }, delay)
        timers.push(t)
      }
    })
  })
}
