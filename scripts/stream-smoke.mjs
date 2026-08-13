import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { _electron: electron } = require('@playwright/test')
const electronPath = require('electron')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client')
const smokeMain = join(ROOT, 'scripts', 'stream-smoke-main.cjs')
const viteBin = resolve(dirname(require.resolve('vite')), '../../bin/vite.js')
const hlsModuleUrl = '/@fs/' + resolve(ROOT, 'node_modules/hls.js/dist/hls.mjs').replaceAll('\\', '/')
const smokeProfile = mkdtempSync(join(tmpdir(), 'kokomovie-stream-smoke-'))

const allCases = [
  { title: 'Spider-Man: Brand New Day (2026)', req: { type: 'movie', tmdbId: 969681 } },
  { title: 'Demon Slayer: Kimetsu no Yaiba Infinity Castle (2025)', req: { type: 'movie', tmdbId: 1311031, imdbId: 'tt32820897' } },
  { title: 'Lilo & Stitch (2002)', req: { type: 'movie', tmdbId: 11544, imdbId: 'tt0275847' } },
  { title: 'Scary Movie (2026)', req: { type: 'movie', tmdbId: 1273221, imdbId: 'tt32093575' } },
  { title: 'The Matrix (1999)', req: { type: 'movie', tmdbId: 603, imdbId: 'tt0133093' } },
  { title: 'Monsters, Inc. (2001)', req: { type: 'movie', tmdbId: 585, imdbId: 'tt0198781' } },
  { title: 'Game of Thrones S1E1', req: { type: 'tv', tmdbId: 1399, imdbId: 'tt0944947', season: 1, episode: 1 } },
  { title: 'Breaking Bad S1E1', req: { type: 'tv', tmdbId: 1396, imdbId: 'tt0903747', season: 1, episode: 1 } },
]
const caseFilter = process.env.KOKOMOVIE_SMOKE_CASE?.trim().toLowerCase()
const discoveryMode = process.env.KOKOMOVIE_SMOKE_MODE === 'complete' ? 'complete' : 'progressive'
const cases = caseFilter
  ? allCases.filter(({ title }) => title.toLowerCase().includes(caseFilter))
  : allCases
if (cases.length === 0) throw new Error(`No smoke case matched: ${caseFilter}`)

async function waitForRenderer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`Renderer server exited with code ${vite.exitCode}`)
    try {
      const response = await fetch('http://127.0.0.1:5173')
      const html = response.ok ? await response.text() : ''
      if (html.includes('<title>KoKoMovie</title>') && html.includes('<div id="root"></div>')) return
    } catch { /* Vite is still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error('Renderer server did not become ready')
}

async function findMainWindow(electronApp) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const main = electronApp.windows().find((window) => window.url().startsWith('http://localhost:5173'))
    if (main) return main
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error('KokoMovie renderer window did not open')
}

async function runCase(page, testCase) {
  const startedAt = Date.now()
  const outcome = await page.evaluate(async ({ req, hlsUrl }) => {
    const searchId = crypto.randomUUID()
    let latestSnapshot
    let finishCollection
    const collectionFinished = new Promise((resolve) => { finishCollection = resolve })
    const unsubscribe = window.electronAPI.onStreamsCollected((payload) => {
      if (payload.searchId !== searchId) return
      latestSnapshot = payload
      if (payload.sourceStatuses?.length > 0 && payload.sourceStatuses.every((status) => status.state !== 'searching')) {
        finishCollection()
      }
    })
    const result = await Promise.race([
      window.electronAPI.getFirstStream(req, searchId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('provider search exceeded 45 seconds')), 45_000)),
    ])
    if (!result?.streams?.[0]?.url) {
      unsubscribe()
      return { status: 'no_stream' }
    }

    const stream = result.streams[0]
    const isDirect = /\.(?:mp4|webm|mkv)(?:$|[?#])/i.test(stream.url)
    let manifestValid = false
    let responseStatus = 0
    let responseContentType = ''
    let responseContentRange = ''
    let firstBytesHex = ''
    try {
      const response = await fetch(stream.url, isDirect ? { headers: { Range: 'bytes=0-1023' } } : undefined)
      responseStatus = response.status
      responseContentType = response.headers.get('content-type') ?? ''
      responseContentRange = response.headers.get('content-range') ?? ''
      if (response.ok) {
        if (isDirect) {
          const prefix = new Uint8Array(await response.arrayBuffer())
          manifestValid = prefix.length > 0
          firstBytesHex = [...prefix.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
        } else {
          manifestValid = (await response.text()).includes('#EXTM3U')
        }
      }
    } catch { /* The playback attempt below remains authoritative. */ }

    const playback = await new Promise(async (resolvePlayback) => {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.style.display = 'none'
      document.body.appendChild(video)
      let hls
      let settled = false
      const finish = (playing, reason) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { hls?.destroy() } catch {}
        video.pause()
        video.removeAttribute('src')
        video.load()
        video.remove()
        resolvePlayback({ playing, reason })
      }
      const timer = setTimeout(() => finish(false, 'playback timeout'), 30_000)
      video.addEventListener('playing', () => finish(true, 'playing'), { once: true })
      video.addEventListener('error', () => finish(false, `media error ${video.error?.code ?? 'unknown'}`), { once: true })

      try {
        if (isDirect) {
          video.src = stream.url
          await video.play().catch(() => {})
        } else {
          const { default: Hls } = await import(hlsUrl)
          if (!Hls.isSupported()) {
            finish(false, 'hls.js unsupported')
            return
          }
          hls = new Hls({ maxBufferLength: 10, maxMaxBufferLength: 20 })
          hls.on(Hls.Events.MANIFEST_PARSED, () => { void video.play().catch(() => {}) })
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) finish(false, `fatal ${data.details}`)
          })
          hls.loadSource(stream.url)
          hls.attachMedia(video)
        }
      } catch (error) {
        finish(false, error instanceof Error ? error.message : String(error))
      }
    })

    await Promise.race([
      collectionFinished,
      new Promise((resolve) => setTimeout(resolve, 35_000)),
    ])
    unsubscribe()

    return {
      status: 'stream',
      providerId: result.providerId,
      providerName: result.providerName,
      alternatives: latestSnapshot?.allStreams?.length ?? result.allStreams?.length ?? 0,
      sourceStates: latestSnapshot?.sourceStatuses?.reduce((counts, source) => {
        counts[source.state] = (counts[source.state] ?? 0) + 1
        return counts
      }, {}) ?? {},
      manifestValid,
      responseStatus,
      responseContentType,
      responseContentRange,
      firstBytesHex,
      streamKind: isDirect ? 'direct' : 'hls',
      qualityInfo: stream.qualityInfo,
      playback,
    }
  }, { req: testCase.req, hlsUrl: hlsModuleUrl })

  return { title: testCase.title, elapsedMs: Date.now() - startedAt, ...outcome }
}

const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--strictPort'], {
  cwd: CLIENT,
  env: { ...process.env },
  stdio: ['ignore', 'ignore', 'ignore'],
  windowsHide: true,
})

let electronApp
try {
  await waitForRenderer()
  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [smokeMain],
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development', KOKOMOVIE_SMOKE_PROFILE: smokeProfile },
  })
  const page = await findMainWindow(electronApp)
  await page.waitForFunction(() => Boolean(window.electronAPI?.getFirstStream), undefined, { timeout: 30_000 })
  // Disconnect the live React/Vite HMR client before long-running provider calls. The document
  // keeps the preload bridge and localhost origin, while late dependency optimization can no
  // longer reload the automation context in the middle of a 40-second provider race.
  await page.setContent('<!doctype html><html><body><p>KokoMovie stream smoke test</p></body></html>')
  await page.waitForFunction(() => Boolean(window.electronAPI?.getFirstStream), undefined, { timeout: 5_000 })
  await page.evaluate((mode) => window.electronAPI.prefsSet({ sourceDiscoveryMode: mode }), discoveryMode)

  for (const testCase of cases) {
    const outcome = await runCase(page, testCase)
    console.log(JSON.stringify(outcome))
  }
} finally {
  if (electronApp) await electronApp.close().catch(() => {})
  vite.kill()
  try {
    rmSync(smokeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch { /* Windows may briefly retain Chromium cache handles after Electron exits. */ }
}
