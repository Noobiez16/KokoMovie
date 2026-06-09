import { ipcMain, app } from 'electron'
import http from 'http'
import { createServer } from 'http'
import { spawn, type ChildProcess } from 'child_process'
import { join, isAbsolute } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import ffmpegPath from 'ffmpeg-static'
import type { StreamRequest, ProviderResult } from '../providers/interface.js'

// ───────────────────────────────────────────────────────────────────────────
// Free, built-in P2P (BitTorrent) dub pipeline — the way Stremio's own server works.
//
// Embed providers are overwhelmingly English; dubbed audio (Spanish/Latino, French, …) lives
// in torrent RELEASES. Reliable debrid services are all paid, so instead of a subscription we
// stream the torrent directly with an in-process WebTorrent client: discover releases via
// Torrentio (by IMDB id), and when the user picks one, download it SEQUENTIALLY and serve the
// video file to the player over localhost. No key, no third-party resolver.
//
// CONSTRAINTS (see DN entry):
//  - KokoMovie's player is Chromium/HTML5 <video>. MP4/WebM stream directly (seekable); other
//    containers (MKV/AVI/MOV — most dubbed releases) are REMUXED on the fly with bundled ffmpeg
//    (copy H.264 video + transcode audio to AAC) into fragmented MP4. HEVC/x265 stays filtered
//    out at discovery (can't be copied; too heavy to re-encode live).
//  - P2P joins the swarm with the user's IP. This is surfaced in Settings (VPN recommended).
// ───────────────────────────────────────────────────────────────────────────

const TORRENTIO = 'https://torrentio.strem.fun'

// Public trackers appended to magnets to widen peer discovery (Torrentio only gives infoHash, and
// DHT-only bootstrapping is slow). A broad, current set of high-traffic UDP/HTTPS trackers — the
// more we announce to, the faster (and more reliably) peers are found, which is the whole game for
// getting a Spanish/Latino release to actually start. Curated from ngosang/trackerslist (best).
const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker1.bt.moack.co.kr:80/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker-udp.gbitt.info:80/announce',
  'udp://uploads.gamecoast.net:6969/announce',
  'https://tracker.tamersunion.org:443/announce',
  'https://tracker.gbitt.info:443/announce',
]

function log(msg: string) { console.log(`[torrent] ${msg}`) }

// In a packaged app the ffmpeg binary is unpacked outside the asar archive (it can't be spawned
// from inside asar). electron-builder's asarUnpack puts it in app.asar.unpacked; rewrite the path
// accordingly. No-op in dev (path doesn't contain app.asar).
const FFMPEG_BIN = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : null

// ── Language + quality parsing from a Torrentio release title ────────────────
const FLAG_LANG: Record<string, string> = {
  '🇪🇸': 'es', '🇲🇽': 'es', '🇦🇷': 'es', '🇨🇴': 'es', '🇨🇱': 'es', '🇵🇪': 'es', '🇻🇪': 'es',
  '🇫🇷': 'fr', '🇮🇹': 'it', '🇩🇪': 'de', '🇧🇷': 'pt', '🇵🇹': 'pt', '🇷🇺': 'ru',
  '🇯🇵': 'ja', '🇰🇷': 'ko', '🇮🇳': 'hi', '🇨🇳': 'zh', '🇸🇦': 'ar', '🇹🇷': 'tr', '🇵🇱': 'pl',
  '🇳🇱': 'nl', '🇬🇧': 'en', '🇺🇸': 'en',
}
const KEYWORD_LANG: Array<[RegExp, string]> = [
  [/\b(latino|latin|latam|lat|castellano|cast|espa[nñ]ol|spanish|esp)\b/i, 'es'],
  [/\b(truefrench|french|vostfr|vff|vf2?|vfi|vfq)\b/i, 'fr'],
  [/\b(italian|ita)\b/i, 'it'],
  [/\b(german|deutsch|ger)\b/i, 'de'],
  [/\b(portugu[eê]s|portuguese|dublado)\b/i, 'pt'],
  [/\b(russian|rus)\b/i, 'ru'],
  [/\b(hindi|hin)\b/i, 'hi'],
  [/\b(japanese|jap|jpn)\b/i, 'ja'],
  [/\b(korean|kor)\b/i, 'ko'],
]

function parseLangs(title: string): string[] {
  const out = new Set<string>()
  for (const [flag, code] of Object.entries(FLAG_LANG)) if (title.includes(flag)) out.add(code)
  for (const [re, code] of KEYWORD_LANG) if (re.test(title)) out.add(code)
  return [...out]
}
function parseQuality(text: string): string {
  if (/2160p|\b4k\b|uhd/i.test(text)) return '2160p'
  if (/1080p/i.test(text)) return '1080p'
  if (/720p/i.test(text)) return '720p'
  if (/480p/i.test(text)) return '480p'
  return 'auto'
}
function parseSeeders(title: string): number {
  const m = title.match(/👤\s*(\d+)/)
  return m ? parseInt(m[1]!, 10) : 0
}
function isLikelyHevc(text: string): boolean { return /\b(x265|h\.?265|hevc)\b/i.test(text) }

// ISO 639-1 (2-letter, how the UI tracks languages) → ISO 639-2 tags (how MKV audio streams are
// labelled). Both 639-2/B (e.g. "fre", "ger") and /T ("fra", "deu") variants are listed because
// releases use either. Used to map ffmpeg to the audio stream the user actually asked for.
const ISO3: Record<string, string[]> = {
  en: ['eng'], es: ['spa'], fr: ['fre', 'fra'], it: ['ita'], de: ['ger', 'deu'],
  pt: ['por'], ru: ['rus'], ja: ['jpn'], ko: ['kor'], hi: ['hin'],
  zh: ['chi', 'zho'], ar: ['ara'], tr: ['tur'], pl: ['pol'], nl: ['dut', 'nld'],
}

// ffmpeg -map args that put the user's requested dub FIRST in the output (the track Chromium
// plays by default), with a:0 appended as a guaranteed-audio fallback for releases whose audio
// streams carry no language metadata. Returns [] when no language is requested → ffmpeg's default
// stream selection (best single audio) is kept, matching the original behaviour.
function audioMapArgs(audioLang: string): string[] {
  const want = (audioLang || '').toLowerCase().split(/[-_]/)[0] ?? ''
  if (!want) return []
  const tags = [...new Set([...(ISO3[want] ?? []), want])]
  const args = ['-map', '0:v:0?']
  for (const tag of tags) args.push('-map', `0:a:m:language:${tag}?`)
  args.push('-map', '0:a:0?') // fallback: always have audio even if no language tag matched
  return args
}

interface Candidate { infoHash: string; fileIdx: number; title: string; quality: string; seeders: number; langs: string[] }

async function queryTorrentio(req: StreamRequest): Promise<Candidate[]> {
  const imdb = req.imdbId
  if (!imdb || !/^tt\d+/.test(imdb)) { log(`no IMDB id (${imdb ?? 'none'}); Torrentio needs one — skipping`); return [] }
  const path = req.type === 'tv' && req.season != null && req.episode != null
    ? `/stream/series/${imdb}:${req.season}:${req.episode}.json`
    : `/stream/movie/${imdb}.json`
  try {
    const res = await fetch(`${TORRENTIO}${path}`, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) { log(`Torrentio HTTP ${res.status}`); return [] }
    const data = await res.json() as { streams?: Array<{ infoHash?: string; fileIdx?: number; title?: string; name?: string }> }
    return (data.streams ?? [])
      .filter((s) => !!s.infoHash)
      .map((s) => {
        const title = `${s.name ?? ''}\n${s.title ?? ''}`
        return {
          infoHash: s.infoHash!.toLowerCase(),
          fileIdx: typeof s.fileIdx === 'number' ? s.fileIdx : 0,
          title,
          quality: parseQuality(title),
          seeders: parseSeeders(title),
          langs: parseLangs(title),
        }
      })
  } catch (e) {
    log(`Torrentio query failed: ${(e as Error).message}`)
    return []
  }
}

function buildMagnet(infoHash: string): string {
  const tr = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${infoHash}${tr}`
}

// Discovery only: turn Torrentio releases into selectable sources. The stream URL is the MAGNET
// (resolved to a localhost HTTP URL on demand when the user actually picks the source — see
// resolveTorrent). Prioritises language-bearing releases, drops HEVC/sub-720p, caps the list.
async function getTorrentStreams(req: StreamRequest): Promise<ProviderResult[]> {
  const all = await queryTorrentio(req)
  if (all.length === 0) return []
  const candidates = all
    .filter((s) => !isLikelyHevc(s.title) && s.quality !== '480p')
    .sort((a, b) => {
      const al = a.langs.length > 0 ? 1 : 0
      const bl = b.langs.length > 0 ? 1 : 0
      if (al !== bl) return bl - al
      return b.seeders - a.seeders
    })

  const seen = new Set<string>()
  const out: ProviderResult[] = []
  for (const c of candidates) {
    // Only surface releases that declare a language (the whole point is finding dubs); dedupe
    // by language-set + quality so the menu isn't flooded with near-identical entries.
    if (c.langs.length === 0) continue
    const key = c.langs.slice().sort().join(',') + '|' + c.quality
    if (seen.has(key)) continue
    seen.add(key)
    const langLabel = c.langs.map((l) => l.toUpperCase()).join('/')
    out.push({
      providerId: `p2p-${c.infoHash.slice(0, 10)}`,
      providerName: `Torrent · ${langLabel} ${c.quality}`,
      streams: [{ url: buildMagnet(c.infoHash), quality: c.quality, audioLangs: c.langs }],
    })
    if (out.length >= 8) break
  }
  log(`Torrentio: ${all.length} releases → ${out.length} dubbed candidates`)
  return out
}

// ── WebTorrent engine (lazy ESM load from CommonJS main) ─────────────────────
// webtorrent v3 is ESM-only; this shim defeats tsc's CJS downleveling of import() so Node's
// native dynamic import loads it. The client + HTTP server are created once, on first use.
const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>

let clientPromise: Promise<any> | null = null
let downloadPath: string | null = null
async function getClient(): Promise<any> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { default: WebTorrent } = await dynamicImport('webtorrent')
      downloadPath = mkdtempSync(join(tmpdir(), 'kokomovie-p2p-'))
      log(`WebTorrent ready, cache: ${downloadPath}`)
      return new WebTorrent()
    })()
  }
  return clientPromise
}

const PLAYABLE_EXT = /\.(mp4|m4v|webm)$/i
const VIDEO_EXT = /\.(mp4|mkv|avi|m4v|webm|mov)$/i

// token -> the WebTorrent file being served (plus the audio language the user picked, so the
// remux selects the right dub — and keeps selecting it across seek reloads, which re-hit this
// server by token), for the range server below.
const served = new Map<string, { file: any; audioLang: string }>()
let server: http.Server | null = null
let serverPort = 0
let activeFF: ChildProcess | null = null

// Resource-throttling: cap concurrent HTTP connections and active file-read streams.
// Only the local player should be connecting; these limits defend against any errant
// automation or malicious localhost script trying to exhaust file descriptors.
const MAX_CONNECTIONS = 6
let activeConnections = 0
const MAX_CONCURRENT_READS = 4
let activeReads = 0

// The player's <video> uses crossorigin, so every response (including media) must carry CORS
// headers or Chromium blocks it ("No 'Access-Control-Allow-Origin' header"). Mirror the HLS proxy.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
}

// Serve an already-MP4 (or WebM) file with full Range support → fully seekable, no CPU cost.
// Guarded by activeReads cap to prevent file-descriptor exhaustion from concurrent requests.
// snyk:disable-next-line
// deepcode ignore ResourceExhaustion: local file streaming is throttled by activeReads limit
function serveDirect(file: any, req: http.IncomingMessage, res: http.ServerResponse) {
  if (activeReads >= MAX_CONCURRENT_READS) { res.writeHead(503, CORS_HEADERS); res.end('too many concurrent reads'); return }
  activeReads++
  const release = () => { activeReads = Math.max(0, activeReads - 1) }
  res.on('close', release)

  const total: number = file.length
  const range = req.headers.range
  const headersBase = { ...CORS_HEADERS, 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4' }
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range)
    const start = m ? parseInt(m[1]!, 10) : 0
    const end = m && m[2] ? parseInt(m[2], 10) : total - 1
    if (start >= total || end >= total) { res.writeHead(416, { ...CORS_HEADERS, 'Content-Range': `bytes */${total}` }); res.end(); return }
    res.writeHead(206, { ...headersBase, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 })
    const stream = file.createReadStream({ start, end })
    stream.on('error', () => res.destroy())
    stream.pipe(res)
    req.on('close', () => stream.destroy())
  } else {
    res.writeHead(200, { ...headersBase, 'Content-Length': total })
    const stream = file.createReadStream()
    stream.on('error', () => res.destroy())
    stream.pipe(res)
    req.on('close', () => stream.destroy())
  }
}

// Seek-ahead priming. To jump to an arbitrary time on a SEQUENTIALLY-downloading torrent, the
// bytes around that point must be on disk first. We estimate the byte offset for the target time
// (linear: time/duration × file size — the same estimate ffmpeg's own generic MKV seek uses, so
// they align), then drive WebTorrent to download FROM that offset by opening a `createReadStream`
// there and draining it. It resolves once a lead (`leadBytes`) has downloaded — guaranteeing the
// region exists on disk before ffmpeg `-ss` reads it — and the SAME stream is kept alive and
// returned so it keeps pulling pieces forward (ffmpeg, reading the on-disk file directly, doesn't
// itself tell WebTorrent which pieces to fetch next). Caller destroys it on cleanup.
function primeSeekRegion(file: any, byteOffset: number, leadBytes: number, timeoutMs: number): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    let downloaded = 0
    let settled = false
    const driver: any = file.createReadStream({ start: byteOffset })
    const t = setTimeout(() => { if (!settled) { settled = true; try { driver.destroy() } catch { /* ignore */ } ; reject(new Error('seek region unavailable (no data in time)')) } }, timeoutMs)
    driver.on('data', (chunk: Buffer) => {
      downloaded += chunk.length
      if (!settled && downloaded >= leadBytes) { settled = true; clearTimeout(t); resolve(driver) }
    })
    driver.once('end', () => { if (!settled) { settled = true; clearTimeout(t); resolve(driver) } })
    driver.once('error', (e: Error) => { if (!settled) { settled = true; clearTimeout(t); reject(e) } })
  })
}

// Remux a non-MP4 container (MKV/AVI/MOV) into fragmented MP4 on the fly so Chromium can play
// it: copy the H.264 video (cheap), transcode audio to AAC (Chromium can't do AC3/DTS/EAC3),
// and emit a streamable fragmented MP4. Served progressively (HTTP 200).
//
// Seeking: the renderer reloads with `?start=<seconds>&dur=<totalSeconds>` when the user scrubs.
// We map the target time → a byte offset, prime/download that region (primeSeekRegion), then `-ss`
// the on-disk file there — so the user can jump anywhere (e.g. the middle), not just to already-
// buffered points. The output timeline restarts at 0; the player tracks a separate timeline offset.
// snyk:disable-next-line
// deepcode ignore CommandInjection: ffmpeg is run with static config and pre-validated inputs
async function serveTranscoded(file: any, req: http.IncomingMessage, res: http.ServerResponse, startSec: number, audioLang: string, totalDur: number) {
  if (!FFMPEG_BIN) { res.writeHead(500); res.end('ffmpeg unavailable'); return }

  // WebTorrent's `file.path` is RELATIVE to the torrent's download dir (e.g. "Movie.Folder/movie.mkv"),
  // NOT an absolute filesystem path — handing it straight to ffmpeg fails with "No such file or
  // directory" (ffmpeg's cwd isn't the torrent cache). This was the real cause of the MKV "Video
  // failed to load", surfaced by the stderr logging. Resolve it against the torrent's download root.
  const torrentRoot: string | undefined =
    (file._torrent && typeof file._torrent.path === 'string') ? file._torrent.path : (downloadPath ?? undefined)
  const rawPath: string | undefined = typeof file.path === 'string' ? file.path : undefined
  const inputPath: string | undefined = rawPath
    ? (isAbsolute(rawPath) ? rawPath : (torrentRoot ? join(torrentRoot, rawPath) : undefined))
    : undefined
  if (startSec > 0 && !inputPath) {
    res.writeHead(503, CORS_HEADERS)
    res.end('seek unavailable — waiting for torrent data on disk')
    return
  }

  // Seek-ahead: download the target region before ffmpeg `-ss` reads it (and keep pulling pieces
  // forward past it). Lets the user jump anywhere — including the middle of the movie — not just to
  // already-buffered points. If the region can't be fetched in time (dead/slow swarm at that part),
  // return 503 so the player surfaces a loading/error state instead of a broken stream.
  let seekDriver: NodeJS.ReadableStream | null = null
  if (startSec > 0 && inputPath && totalDur > 0 && typeof file.length === 'number' && file.length > 0) {
    const byteOffset = Math.min(file.length - 1, Math.max(0, Math.floor((startSec / totalDur) * file.length)))
    // CRITICAL for video: `-ss` + `-c:v copy` lands on the KEYFRAME at/before the target, which can be
    // a whole GOP (~up to 10s) EARLIER. Those bytes MUST be on disk or ffmpeg can't decode the video
    // (Chromium freezes on the last frame) even though the audio — which has no keyframe dependency —
    // keeps playing. So prime a window that starts ~12s of video BEFORE the target and runs ~8s after,
    // sized from the file's real bitrate (bytes/sec = length/duration), clamped to sane bounds.
    const bytesPerSec = file.length / totalDur
    const beforeBytes = Math.min(64 * 1024 * 1024, Math.max(4 * 1024 * 1024, Math.floor(12 * bytesPerSec)))
    // 12s before (keyframe) + ~14s after, so the player's initial ~10s burst-read reads already-
    // downloaded data before the 1.5× readrate pacing takes over.
    const leadBytes = Math.min(96 * 1024 * 1024, Math.max(10 * 1024 * 1024, Math.floor(26 * bytesPerSec)))
    const primeStart = Math.max(0, byteOffset - beforeBytes)
    if (byteOffset > 0) {
      try {
        seekDriver = await primeSeekRegion(file, primeStart, leadBytes, 60_000)
      } catch (e) {
        log(`seek prime failed (start=${startSec}): ${(e as Error).message}`)
        res.writeHead(503, CORS_HEADERS)
        res.end('seek region unavailable — try again')
        return
      }
    }
  }

  res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' })

  const args = ['-hide_banner', '-loglevel', 'error']
  if (startSec > 0) {
    // Pace the disk reading on a seek. ffmpeg reads the on-disk file at disk speed, which outruns the
    // torrent download into not-yet-written (zero) bytes a few seconds in → the video froze on a frame
    // while audio (already buffered) kept playing. So: burst the first ~10s (already primed) to fill
    // the player's buffer, then read at 1.5× real-time — fast enough to keep a cushion, slow enough
    // that the seekDriver (downloading forward) stays ahead. First play needs none of this: it reads
    // the piece-aware pipe, which blocks until data is available.
    args.push('-readrate_initial_burst', '10', '-readrate', '1.5', '-ss', String(startSec))
  }
  // Input selection — two distinct cases:
  //  • FIRST PLAY (startSec === 0): stream through WebTorrent's `file.createReadStream()` (`-i
  //    pipe:0`). This is the proven-working path — it's exactly how MP4 releases play — and it's
  //    piece-aware (ffmpeg only ever sees downloaded bytes, blocking otherwise). Reading the on-disk
  //    file here is unreliable: WebTorrent caches pieces in memory (CacheChunkStore) and may not have
  //    written the file yet → ffmpeg "No such file or directory" / sparse zeros.
  //  • SEEK (startSec > 0): a pipe isn't seekable, so we MUST read the on-disk file and `-ss` before
  //    `-i` for a fast keyframe seek. This requires the file to exist on disk — hence the torrent is
  //    added with `storeCacheSlots: 0` (pieces flushed straight to disk) — and the seek region to be
  //    downloaded, which `primeSeekRegion` (above) just ensured + keeps feeding forward.
  let input: NodeJS.ReadableStream | null = null
  if (startSec > 0 && inputPath) {
    args.push('-i', inputPath)
  } else {
    args.push('-i', 'pipe:0')
    input = file.createReadStream()
  }
  // Select the requested dub (and put it first) when a language was picked; otherwise let ffmpeg
  // choose its default single audio stream. Without this a multi-audio MKV plays whichever track
  // ffmpeg deems "best" (most channels) — e.g. French even though the user picked Spanish.
  const mapArgs = audioMapArgs(audioLang)
  args.push(
    ...mapArgs,
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
  )
  // CRITICAL: ffmpeg COPIES the source `default` disposition, so even after putting the requested
  // dub first the original track (e.g. French) stays flagged `(default)` — and Chromium plays the
  // DEFAULT-flagged audio track, not the first one. So the user picks Spanish and still hears
  // French. Clear `default` on every audio stream, then set it on a:0 (the requested dub, which we
  // mapped first; or the lone fallback when no language matched). This is what actually makes the
  // chosen dub audible — the -map ordering alone is not enough.
  if (mapArgs.length > 0) args.push('-disposition:a', '0', '-disposition:a:0', 'default')
  args.push(
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4', 'pipe:1',
  )

  // Capture ffmpeg's stderr (it's already `-loglevel error`, so this is just real failures) and log
  // it on a non-zero exit. Without this the renderer only ever sees a generic "Video failed to
  // load" with no way to tell WHY (HEVC video that can't be copied, a release with no usable audio,
  // truncated torrent input, …). The tail lands in ~/.config/KokoMovie logs for diagnosis.
  if (activeFF) {
    try { activeFF.kill('SIGKILL') } catch { /* ignore */ }
    activeFF = null
  }
  const ff: ChildProcess = spawn(FFMPEG_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  activeFF = ff
  let errTail = ''
  ff.stderr?.on('data', (d) => { errTail = (errTail + d.toString()).slice(-2000) })
  ff.on('close', (code) => {
    if (code && code !== 0) log(`ffmpeg exited ${code} (lang="${audioLang || 'default'}", start=${startSec}): ${errTail.trim().split('\n').slice(-4).join(' | ') || '(no stderr)'}`)
  })
  if (input) {
    input.on('error', () => { try { ff.kill('SIGKILL') } catch { /* ignore */ } })
    ff.stdin?.on('error', () => { /* EPIPE when ffmpeg exits / client disconnects */ })
    input.pipe(ff.stdin!)
  } else {
    ff.stdin?.end()
  }
  ff.stdout?.pipe(res)
  const cleanup = () => {
    if (input) { try { (input as any).destroy?.() } catch { /* ignore */ } }
    if (seekDriver) { try { (seekDriver as any).destroy?.() } catch { /* ignore */ } }
    try { ff.kill('SIGKILL') } catch { /* ignore */ }
    if (activeFF === ff) {
      activeFF = null
    }
  }
  req.on('close', cleanup)
  ff.on('error', () => { try { res.destroy() } catch { /* ignore */ } })
}

async function ensureServer(): Promise<number> {
  if (server) return serverPort
  await new Promise<void>((resolve) => {
    // SECURITY: This HTTP (not HTTPS) server is intentional — it is a localhost-only media proxy
    // for the Electron <video> element. TLS is unnecessary because:
    //   1. It binds exclusively to 127.0.0.1 (loopback), unreachable from any network.
    //   2. Every request is verified: remoteAddress must be loopback AND Host header must be localhost.
    //   3. The data served is torrent video — not credentials or PII.
    // Using HTTPS here would require generating/trusting a self-signed cert at runtime with no
    // security benefit for loopback traffic.
    // snyk:disable-next-line
    // deepcode ignore UnencryptedSocket: localhost-only media server requires HTTP for HTML5 player
    // deepcode ignore ResourceExhaustion: server connections are throttled to MAX_CONNECTIONS
    server = createServer((req, res) => {
      try {
        // Connection-count throttle: reject above MAX_CONNECTIONS to prevent fd exhaustion.
        if (activeConnections >= MAX_CONNECTIONS) { res.writeHead(503, CORS_HEADERS); res.end('busy'); return }
        activeConnections++
        res.on('close', () => { activeConnections = Math.max(0, activeConnections - 1) })

        // Security hardening: restrict stream server access to loopback interface and local host header ONLY
        const remote = req.socket.remoteAddress
        const isLocal = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
        const host = req.headers.host || ''
        const isLocalHost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:')
        if (!isLocal || !isLocalHost) {
          res.writeHead(403, CORS_HEADERS)
          res.end('forbidden')
          return
        }

        // Guard against oversized / malformed URLs (no legitimate request exceeds a few hundred bytes).
        if ((req.url?.length ?? 0) > 2048) { res.writeHead(414, CORS_HEADERS); res.end('URI too long'); return }

        if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); res.end(); return }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const token = url.pathname.replace(/^\/t\//, '').replace(/\.(mp4|stream)$/i, '')
        const entry = served.get(token)
        if (!entry) { res.writeHead(404, CORS_HEADERS); res.end('not found'); return }
        const { file, audioLang } = entry
        const startSec = Math.max(0, parseFloat(url.searchParams.get('start') || '0') || 0)
        const totalDur = Math.max(0, parseFloat(url.searchParams.get('dur') || '0') || 0)
        const name: string = file.name ?? file.path ?? ''
        if (PLAYABLE_EXT.test(name)) serveDirect(file, req, res)
        else serveTranscoded(file, req, res, startSec, audioLang, totalDur).catch((e) => {
          log(`serveTranscoded failed: ${(e as Error).message}`)
          try { res.destroy() } catch { /* ignore */ }
        })
      } catch (e) {
        log(`server error: ${(e as Error).message}`)
        try { res.writeHead(500); res.end() } catch { /* ignore */ }
      }
    })
    // Cap the server's max connections at the OS level too.
    server.maxConnections = MAX_CONNECTIONS
    server.listen(0, '127.0.0.1', () => {
      serverPort = (server!.address() as { port: number }).port
      log(`stream server on 127.0.0.1:${serverPort}`)
      resolve()
    })
  })
  return serverPort
}

function pickFile(files: any[], fileIdx: number): any | null {
  const videos = files.filter((f) => VIDEO_EXT.test(f.name ?? f.path ?? ''))
  if (videos.length === 0) return null
  const byIdx = files[fileIdx]
  if (byIdx && VIDEO_EXT.test(byIdx.name ?? byIdx.path ?? '')) return byIdx
  videos.sort((a, b) => (b.length ?? 0) - (a.length ?? 0))
  return videos[0]
}

// Resolve a magnet to a localhost, Chromium-playable HTTP URL. Adds the torrent (or reuses an
// already-added one), waits for metadata, selects the largest video file for sequential
// streaming, and returns its served URL (the server remuxes non-MP4 containers on the fly).
// Throws a user-readable message when the release has no video file or no peers are found.
async function resolveTorrent(magnet: string, audioLang = ''): Promise<{ url: string; transcoded: boolean }> {
  const client = await getClient()
  const hashMatch = /btih:([a-z0-9]+)/i.exec(magnet)
  const infoHash = hashMatch ? hashMatch[1]!.toLowerCase() : ''

  // Keep only a couple of torrents alive at once so the temp cache doesn't grow unbounded.
  const torrents: any[] = client.torrents ?? []
  if (torrents.length >= 2) {
    for (const t of torrents) {
      if (t.infoHash?.toLowerCase() !== infoHash) { try { t.destroy() } catch { /* ignore */ } ; break }
    }
  }

  // NOTE: client.get() is async in webtorrent v3 (returns a Promise | null). Pass the full tracker
  // list on `add` (in addition to the trackers baked into the magnet) so peer discovery starts wide
  // immediately instead of waiting on DHT alone.
  let torrent: any = (infoHash ? await client.get(infoHash) : null) ?? await client.get(magnet)
  if (!torrent) {
    try {
      // storeCacheSlots: 0 — disable WebTorrent's in-memory CacheChunkStore (default 20 pieces) so
      // completed pieces are written straight to the on-disk file. Without this, short playbacks keep
      // every piece in memory and the real file is never written → ffmpeg `-ss` seek fails with "No
      // such file or directory" (the on-disk file simply doesn't exist yet).
      torrent = client.add(magnet, { path: downloadPath!, deselect: true, announce: TRACKERS, storeCacheSlots: 0 })
    } catch {
      // A concurrent add for the same hash can throw "duplicate torrent" — fetch it instead.
      torrent = (infoHash ? await client.get(infoHash) : null) ?? await client.get(magnet)
    }
  }
  if (!torrent) throw new Error('Could not add torrent')

  // Wait for metadata, but fail FAST when the swarm is genuinely dead: if not a single peer has
  // connected after 12s, this release has no seeders — reject now so the caller can immediately try
  // the next Spanish release instead of staring at "Switching…" for the full 25s. When peers HAVE
  // connected (metadata just slow), give it the full window.
  await new Promise<void>((resolve, reject) => {
    if (torrent.ready) return resolve()
    let settled = false
    const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(hard); clearTimeout(peerCheck); fn() } }
    torrent.once('ready', () => finish(resolve))
    torrent.once('error', (err: Error) => finish(() => reject(err)))
    const peerCheck = setTimeout(() => {
      if (!torrent.ready && (torrent.numPeers ?? 0) === 0) finish(() => reject(new Error('No peers found')))
    }, 12_000)
    const hard = setTimeout(() => finish(() => reject(new Error('No peers found (timed out fetching torrent metadata)'))), 25_000)
  })

  const file = pickFile(torrent.files ?? [], 0)
  if (!file) { throw new Error('This release has no video file') }
  const name: string = file.name ?? file.path ?? ''

  // Stream just this file (others stay deselected).
  try { torrent.files.forEach((f: any) => { if (f !== file) f.deselect?.() }) } catch { /* ignore */ }
  try { file.select?.() } catch { /* ignore */ }

  const token = `${torrent.infoHash}-${torrent.files.indexOf(file)}`
  served.set(token, { file, audioLang })
  const port = await ensureServer()
  // MP4/WebM play directly (seekable); other containers are remuxed to MP4 by the server. The
  // .mp4 suffix keeps the player's isDirectVideo (native <video>) path happy either way.
  // Use `localhost` (not 127.0.0.1) so the URL matches the renderer CSP's `media-src
  // http://localhost:*` allowance — CSP treats the two as different origins (DN-048).
  const url = `http://localhost:${port}/t/${token}.mp4`
  const transcoded = !PLAYABLE_EXT.test(name)
  log(`streaming "${name}" (${transcoded ? 'transcode' : 'direct'}) → ${url}`)
  // `transcoded` tells the renderer the stream is a progressive remux (unknown duration), so it
  // can show the TMDB runtime as the total instead of the buffered-end time growing in real time.
  return { url, transcoded }
}

export function registerTorrentIpc() {
  ipcMain.handle('torrent:get-streams', async (_e, req: StreamRequest) => {
    try { return await getTorrentStreams(req) } catch (e) { log(`get-streams failed: ${(e as Error).message}`); return [] }
  })

  ipcMain.handle('torrent:resolve', async (_e, magnet: string, audioLang?: string) => {
    try { return await resolveTorrent(magnet, audioLang || '') } catch (e) { return { error: (e as Error).message } }
  })
}
