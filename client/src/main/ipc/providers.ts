import { app, ipcMain, session } from 'electron'
import { listProviders, getEnabledProviders, toggleProvider, getProvider } from '../providers/registry.js'
import { extractStreamWithRetry } from '../stream-extractor/index.js'
import type { StreamRequest, ProviderResult } from '../providers/interface.js'
import { appendFileSync } from 'fs'
import { join } from 'path'

function logExtraction(msg: string) {
  try {
    const logPath = join(app.getPath('userData'), 'extraction.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf8')
  } catch {}
}

// Stream headers to inject when the renderer's HLS player fetches segments
// Keyed by URL host prefix
const streamHeadersRegistry = new Map<string, Record<string, string>>()

// Set up the persistent header injector on the main window session
export function initStreamHeaderInjector(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details, callback) => {
      try {
        const host = new URL(details.url).host
        const headers = streamHeadersRegistry.get(host)
        if (headers && Object.keys(headers).length > 0) {
          callback({ requestHeaders: { ...details.requestHeaders, ...headers } })
          return
        }
      } catch { /* ignore */ }
      callback({ requestHeaders: details.requestHeaders })
    },
  )
}

export function registerProvidersIpc(): void {
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

      return {
        providerId,
        providerName: p.name,
        streams: [{ url: result.url, quality: 'auto', headers: result.headers }],
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

  // Try all enabled providers with staggered parallel racing
  ipcMain.handle('providers:getFirstStream', async (_e, req: StreamRequest): Promise<ProviderResult | null> => {
    logExtraction(`--- New Stream Search Request: ${req.title} (${req.type === 'tv' ? `S${req.season}E${req.episode}` : 'Movie'}) | IMDB: ${req.imdbId} | TMDB: ${req.tmdbId} ---`)
    const enabled = getEnabledProviders()
    if (enabled.length === 0) {
      logExtraction('WARNING: No providers are enabled in settings')
      return null
    }

    const controller = new AbortController()
    const signal = controller.signal

    let resolvedResult: ProviderResult | null = null

    const batchSize = 4
    const staggerMs = 1500
    const timeoutMs = 20000

    return new Promise<ProviderResult | null>((resolve) => {
      let activeWorkers = 0
      let totalStarted = 0
      let resolved = false
      const timers: NodeJS.Timeout[] = []

      const checkFinish = () => {
        if (activeWorkers === 0 && totalStarted === enabled.length && !resolved) {
          logExtraction('SEARCH FINISHED: No streams found from any of the enabled providers.')
          resolve(null)
        }
      }

      const runProvider = async (provider: typeof enabled[0]) => {
        if (resolved || signal.aborted) return

        activeWorkers++
        const embedUrl = provider.getEmbedUrl(req)
        if (!embedUrl) {
          logExtraction(`Provider ${provider.name} skipped: failed to build embed URL.`)
          activeWorkers--
          checkFinish()
          return
        }

        logExtraction(`Worker starting: ${provider.name} | URL: ${embedUrl}`)
        const start = Date.now()

        try {
          const result = await extractStreamWithRetry(embedUrl, {
            maxAttempts: 1,
            timeoutMs,
            sessionName: provider.sessionName,
            signal,
          })

          const duration = Date.now() - start
          if (result && !resolvedResult && !signal.aborted && !resolved) {
            logExtraction(`SUCCESS: ${provider.name} found stream in ${duration}ms | Stream: ${result.url}`)
            resolved = true
            resolvedResult = {
              providerId: provider.id,
              providerName: provider.name,
              streams: [{ url: result.url, quality: 'auto', headers: result.headers }],
            }
            controller.abort()
            timers.forEach(clearTimeout)
            resolve(resolvedResult)
            return
          } else {
            logExtraction(`FAIL: ${provider.name} returned no stream in ${duration}ms.`)
          }
        } catch (err) {
          const duration = Date.now() - start
          logExtraction(`ERROR: ${provider.name} failed after ${duration}ms with error: ${String(err)}`)
        }

        activeWorkers--
        checkFinish()
      }

      // Schedule batches
      for (let i = 0; i < enabled.length; i += batchSize) {
        const batch = enabled.slice(i, i + batchSize)
        const delay = (i / batchSize) * staggerMs

        const t = setTimeout(() => {
          if (resolved || signal.aborted) return
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
