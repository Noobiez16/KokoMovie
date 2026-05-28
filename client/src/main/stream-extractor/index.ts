import { app, BrowserWindow, session } from 'electron'
import { promises as fsPromises } from 'fs'
import { join } from 'path'
import { lookup } from 'dns'

const logQueue: string[] = []
let isWritingLog = false

function logExtraction(msg: string) {
  logQueue.push(`[${new Date().toISOString()}] ${msg}\n`)
  if (logQueue.length > 1000) {
    logQueue.shift()
  }
  triggerLogWrite()
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

export interface ExtractedStream {
  url: string
  headers: Record<string, string>
}

// Patterns that identify HLS/MP4 stream URLs
const STREAM_PATTERNS = [
  /\.m3u8(\?[^"'\s]*)?$/i,
  /\.mp4(\?[^"'\s]*)?$/i,
  /\.webm(\?[^"'\s]*)?$/i,
  /\/playlist\.m3u8/i,
  /\/master\.m3u8/i,
  /\/index\.m3u8/i,
  /\/manifest\.m3u8/i,
  /application\/x-mpegurl/i,
]

// Domains to cancel (ads, trackers, and defunct/dead providers).
// NOTE: hd4u.sbs is VidSrc.rip's player domain — do NOT add it here again.
// Blocking it prevents VidSrc.rip from ever loading its player and extracting a stream.
const BLOCKED_HOSTS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'googlesyndication.com', 'amazon-adsystem.com', 'facebook.com',
  'analytics.', 'stats.', 'tracking.', 'popads.net', 'popcash.net',
  'bulsis.net', 'crewtv.net',
  'youtube.com', 'googlevideo.com', 'ytimg.com', 'youtube-nocookie.com',
]

// Cache DNS resolution results with a 3-minute TTL.
// Without a TTL, a single transient DNS failure permanently blacklists a CDN host
// for the entire app session, causing legitimate providers to always time out.
const hostResolutionCache = new Map<string, { ok: boolean; expiresAt: number }>()
const HOST_RESOLUTION_TTL_MS = 3 * 60 * 1000

function isStreamUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com') || host.includes('googlevideo.com')) {
      return false
    }
    const path = u.pathname + u.search
    return STREAM_PATTERNS.some((p) => p.test(path))
  } catch {
    return false
  }
}

function isCamStream(url: string): boolean {
  try {
    const u = new URL(url.toLowerCase())
    const pathAndSearch = u.pathname + u.search
    
    if (u.searchParams.get('quality') === 'cam' || u.searchParams.get('quality') === 'ts') {
      return true
    }
    
    const camPatterns = [
      /\/cam\b/,
      /\/camrip\b/,
      /\/hdcam\b/,
      /\/hd-cam\b/,
      /\/telesync\b/,
      /\/hdts\b/,
      /\/screener\b/,
      /\bcamrip\b/,
      /\bhdcam\b/,
      /\bhdts\b/,
      /\btsv\b/,
      /\btsrip\b/,
      /\/tsrip\//,
      /\/hdts\//,
    ]
    
    return camPatterns.some((p) => p.test(pathAndSearch))
  } catch {
    return false
  }
}

function isStreamContentType(contentType: string): boolean {
  return (
    contentType.includes('application/x-mpegurl') ||
    contentType.includes('application/vnd.apple.mpegurl') ||
    contentType.includes('video/mp4') ||
    contentType.includes('video/webm')
  )
}

const BLOCKED_EXTENSIONS = [
  '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.otf', '.eot'
]

function shouldBlock(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    if (BLOCKED_HOSTS.some((d) => host.includes(d))) return true
    
    const cached = hostResolutionCache.get(host)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      if (!cached.ok) return true
    } else {
      // Assume resolvable until DNS lookup completes; update cache asynchronously.
      hostResolutionCache.set(host, { ok: true, expiresAt: now + HOST_RESOLUTION_TTL_MS })
      lookup(host, (err) => {
        hostResolutionCache.set(host, { ok: !err, expiresAt: Date.now() + HOST_RESOLUTION_TTL_MS })
      })
    }

    const pathname = parsed.pathname.toLowerCase()
    if (BLOCKED_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return true
    
    return false
  } catch {
    return false
  }
}

function cleanHeaders(raw: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    // Skip headers that cause CORS issues when added manually
    const lower = k.toLowerCase()
    if (['origin', 'host', 'content-length', 'transfer-encoding'].includes(lower)) continue
    out[k] = Array.isArray(v) ? v[0]! : v
  }
  return out
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]

export async function extractStream(
  embedUrl: string,
  options: {
    timeoutMs?: number
    sessionName?: string  // persistent session key (e.g. 'provider-vidsrc')
    attempt?: number
    signal?: AbortSignal
  } = {},
): Promise<ExtractedStream | null> {
  const { timeoutMs = 30000, sessionName, attempt = 0, signal } = options

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null)
      return
    }

    // Always use ephemeral partition for every extraction to avoid cookie/localStorage state pollution
    // (e.g. providers resuming/redirecting to the wrong episode based on previous plays)
    const partition = `providers-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const providerSession = session.fromPartition(partition)

    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      webPreferences: {
        session: providerSession,
        nodeIntegration: false,
        contextIsolation: true,
        // E1-S7: webSecurity is disabled on this isolated off-screen scraper window
        // to permit CORS-disabled stream segment and manifest extraction from external CDNs.
        // This is mitigated by isolating the browser context inside a random ephemeral partition
        // session, enabling contextIsolation, and disabling nodeIntegration.
        webSecurity: process.env['FORCE_WEB_SECURITY'] === 'true',
        javascript: true,
        images: false,
        backgroundThrottling: false,
      },
    })

    win.webContents.setWindowOpenHandler((details) => {
      logExtraction(`[Extractor] Blocked popup window: ${details.url}`)
      return { action: 'deny' }
    })

    let done = false

    const clickInterval = setInterval(() => {
      if (done) return
      try {
        logExtraction(`[Extractor] Simulating click at center (640, 360) for ${embedUrl}`)
        win.webContents.sendInputEvent({ type: 'mouseDown', x: 640, y: 360, button: 'left', clickCount: 1 })
        win.webContents.sendInputEvent({ type: 'mouseUp', x: 640, y: 360, button: 'left', clickCount: 1 })
      } catch {}
    }, 2000)

    const onAbort = () => {
      finish(null)
    }

    if (signal) {
      signal.addEventListener('abort', onAbort)
    }

    const finish = (result: ExtractedStream | null) => {
      if (done) return
      done = true
      clearInterval(clickInterval)
      clearTimeout(timer)
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
      // Remove listeners before destroy to avoid spurious calls
      try { providerSession.webRequest.onSendHeaders(null as any) } catch { /* ignore */ }
      try { providerSession.webRequest.onHeadersReceived(null as any) } catch { /* ignore */ }
      try { providerSession.webRequest.onBeforeRequest(null as any) } catch { /* ignore */ }
      try { win.destroy() } catch { /* already destroyed */ }
      resolve(result)
    }

    // PRIMARY: onSendHeaders gives us URL + request headers simultaneously
    providerSession.webRequest.onSendHeaders(
      { urls: ['*://*/*'] },
      (details) => {
        if (done) return
        if (isStreamUrl(details.url)) {
          if (isCamStream(details.url)) {
            return
          }
          finish({
            url: details.url,
            headers: cleanHeaders(details.requestHeaders),
          })
        }
      },
    )

    // SECONDARY: detect via response Content-Type (catches URLs without .m3u8 extension)
    providerSession.webRequest.onHeadersReceived(
      { urls: ['*://*/*'] },
      (details, callback) => {
        if (!done) {
          const ct = (details.responseHeaders?.['content-type'] ?? details.responseHeaders?.['Content-Type'] ?? []).join('')
          if (isStreamContentType(ct) && details.url.startsWith('http')) {
            try {
              const u = new URL(details.url)
              const host = u.hostname
              if (host.includes('youtube.com') || host.includes('youtube-nocookie.com') || host.includes('googlevideo.com')) {
                callback({ responseHeaders: details.responseHeaders })
                return
              }
            } catch {}
            if (isCamStream(details.url)) {
              callback({ responseHeaders: details.responseHeaders })
              return
            }
            finish({ url: details.url, headers: {} })
          }
        }
        callback({ responseHeaders: details.responseHeaders })
      },
    )

    // TERTIARY: cancel ad/tracker requests to speed up loading
    providerSession.webRequest.onBeforeRequest(
      { urls: ['*://*/*'] },
      (details, callback) => {
        logExtraction(`[Request] ${details.url}`)
        callback({ cancel: shouldBlock(details.url) })
      },
    )

    const timer = setTimeout(() => finish(null), timeoutMs)

    win.webContents.setUserAgent(USER_AGENTS[attempt % USER_AGENTS.length]!)

    win.loadURL(embedUrl, {
      httpReferrer: new URL(embedUrl).origin,
    }).catch((err) => {
      logExtraction(`[Extractor] loadURL failed for ${embedUrl} with error: ${String(err)}`)
      finish(null)
    })

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logExtraction(`[Extractor] did-fail-load for ${validatedURL} | code: ${errorCode} | desc: ${errorDescription} | isMainFrame: ${isMainFrame}`)
      const isMain = isMainFrame === true || validatedURL === embedUrl || validatedURL === (embedUrl + '/')
      if (isMain) {
        finish(null)
      }
    })

    win.on('closed', () => {
      logExtraction(`[Extractor] Window closed for ${embedUrl}`)
      finish(null)
    })
  })
}

// Try extraction with retries and optional session rotation
export async function extractStreamWithRetry(
  embedUrl: string,
  options: {
    maxAttempts?: number
    timeoutMs?: number
    sessionName?: string
    signal?: AbortSignal
  } = {},
): Promise<ExtractedStream | null> {
  const { maxAttempts = 2, timeoutMs = 30000, sessionName, signal } = options

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) return null
    const result = await extractStream(embedUrl, { timeoutMs, sessionName, attempt, signal })
    if (result) return result
    if (attempt < maxAttempts - 1) {
      // Brief pause before retry
      await new Promise((r) => {
        const t = setTimeout(() => r(null), 1000)
        signal?.addEventListener('abort', () => {
          clearTimeout(t)
          r(null)
        })
      })
    }
  }
  return null
}
