import { useRef, useState, useEffect, useCallback, useMemo, memo } from 'react'
import Hls from 'hls.js'
import type { ContentDetail, Episode } from '../../api/catalog'
import type { PlaybackSession } from '../../api/playback'
import { playbackApi } from '../../api/playback'
import { providersApi, torrentApi } from '../../api/providers'
import { PlayerControls } from './PlayerControls'
import { NextEpisodeOverlay } from './NextEpisodeOverlay'
import { autoSyncSubtitles, type SubCue } from '../../lib/subtitleAutoSync'

interface CachedStream {
  providerId: string
  providerName: string
  streams: Array<{ url: string; quality: string; headers?: Record<string, string>; audioLangs?: string[] }>
}

interface Props {
  content: ContentDetail
  episode: Episode | null
  session: PlaybackSession
  streamHeaders?: Record<string, string>
  initialProviderId?: string
  allStreams?: CachedStream[]
  profileId: string
  resumeAtSeconds?: number
  onClose: () => void
  onNextEpisode?: (ep: Episode) => void
  nextEpisode?: Episode | null
  /** Rendered inside a Picture-in-Picture box: fill the parent (not the viewport) and hide
   *  the heavy chrome (title, close, controls) — the PiP host supplies its own controls. */
  embedded?: boolean
  /** Minimise the player into Picture-in-Picture (shown as a control in fullscreen mode). */
  onPip?: () => void
}

// Maps ISO 639-2 (3-letter) codes to ISO 639-1 (2-letter) for language deduplication.
// Without this, 'spa'.slice(0,2) = 'sp' never matches the external sub lang 'es',
// causing Spanish to appear twice (internal HLS + external sideload).
const LANG_NORMALIZE: Record<string, string> = {
  spa: 'es', eng: 'en', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de',
  ita: 'it', por: 'pt', pob: 'pt', rus: 'ru', zho: 'zh', chi: 'zh',
  jpn: 'ja', kor: 'ko', ara: 'ar', tur: 'tr', pol: 'pl',
  nld: 'nl', dut: 'nl', swe: 'sv', nor: 'no', dan: 'da',
  fin: 'fi', heb: 'he', ind: 'id', tha: 'th', vie: 'vi',
}

function normalizeLang(lang: string): string {
  const l = (lang || '').toLowerCase().trim().split(/[-_]/)[0] ?? ''
  return LANG_NORMALIZE[l] ?? l.slice(0, 2)
}

function getStandardHeight(width: number, height: number): number {
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

const LANGUAGE_MAP: Record<string, string> = {
  en: 'English',
  eng: 'English',
  es: 'Spanish',
  spa: 'Spanish',
  fr: 'French',
  fre: 'French',
  fra: 'French',
  de: 'German',
  ger: 'German',
  deu: 'German',
  it: 'Italian',
  ita: 'Italian',
  pt: 'Portuguese',
  por: 'Portuguese',
  pob: 'Portuguese (Brazil)',
  ru: 'Russian',
  rus: 'Russian',
  zh: 'Chinese',
  chi: 'Chinese',
  zho: 'Chinese',
  ja: 'Japanese',
  jpn: 'Japanese',
  ko: 'Korean',
  kor: 'Korean',
  ar: 'Arabic',
  ara: 'Arabic',
  tr: 'Turkish',
  tur: 'Turkish',
  pl: 'Polish',
  pol: 'Polish',
  nl: 'Dutch',
  dut: 'Dutch',
  nld: 'Dutch',
  sv: 'Swedish',
  swe: 'Swedish',
  no: 'Norwegian',
  nor: 'Norwegian',
  da: 'Danish',
  dan: 'Danish',
  fi: 'Finnish',
  fin: 'Finnish',
  he: 'Hebrew',
  heb: 'Hebrew',
  id: 'Indonesian',
  ind: 'Indonesian',
  th: 'Thai',
  tha: 'Thai',
  vi: 'Vietnamese',
  vie: 'Vietnamese',
}

function getCleanSubtitleName(name: string, lang: string): string {
  const input = (lang || name || 'Unknown').toLowerCase().trim()
  
  // Try matching via LANGUAGE_MAP first
  const code = input.slice(0, 3)
  let mapped = LANGUAGE_MAP[code] || LANGUAGE_MAP[code.slice(0, 2)]
  
  if (!mapped) {
    // Try to find if any language name is a substring of the input
    for (const [, val] of Object.entries(LANGUAGE_MAP)) {
      if (input.includes(val.toLowerCase()) || val.toLowerCase().includes(input)) {
        mapped = val
        break
      }
    }
  }
  
  if (mapped) return `${mapped} Sub`
  
  // Fallback
  const cleanBase = input
    .replace(/\(premium\)/gi, '')
    .replace(/subtitles/gi, '')
    .replace(/subtitle/gi, '')
    .replace(/sub/gi, '')
    .replace(/[\[\]\(\)\-\_]/g, ' ')
    .trim()
  
  const formatted = cleanBase.charAt(0).toUpperCase() + cleanBase.slice(1)
  return `${formatted || 'Unknown'} Sub`
}

// Friendly label for an HLS audio rendition. Reuses LANGUAGE_MAP to turn a lang code
// (e.g. 'spa' / 'es') or a manifest track name into a clean language name, with the raw
// track name as a fallback so descriptive labels (e.g. "English (Commentary)") survive.
function getCleanAudioName(name: string, lang: string): string {
  const code = (lang || '').toLowerCase().trim().slice(0, 3)
  const mapped = LANGUAGE_MAP[code] || LANGUAGE_MAP[code.slice(0, 2)]
  if (mapped) return mapped
  const trimmed = (name || lang || '').trim()
  if (trimmed) return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return 'Original'
}

// Preferred audio-dub order when a stream carries multiple language tracks. The first
// available language here is auto-selected on load, and the Audio menu is ordered to match.
// The five priority dubs lead — English, Spanish, French, Italian, Russian — then common extras.
const PREFERRED_AUDIO_LANGS = ['en', 'es', 'fr', 'it', 'ru', 'pt', 'de', 'ja', 'ko', 'hi', 'zh', 'ar']

// Rank a language code by preference (lower = more preferred). Unknown languages sort last
// but keep their relative order, so an unexpected dub still appears — just below the known ones.
function audioLangRank(lang: string): number {
  const i = PREFERRED_AUDIO_LANGS.indexOf(normalizeLang(lang))
  return i === -1 ? PREFERRED_AUDIO_LANGS.length : i
}

// hls.js audioTrack index of the most-preferred available language (-1 if the list is empty).
function preferredAudioIndex(tracks: Array<{ lang?: string }>): number {
  let best = -1
  let bestRank = Infinity
  tracks.forEach((t, i) => {
    const r = audioLangRank(t.lang ?? '')
    if (r < bestRank) { bestRank = r; best = i }
  })
  return best
}

interface SubtitleTracksProps {
  externalSubs: Array<{ id: number; name: string; lang: string; url: string }>
  proxyPort: string
  currentSubtitle: number
  subtitleOffset: number
  /** For progressive torrent remuxes the video timeline starts at 0 after each seek; external
   *  subs are timed against the full movie, so shift cues back by this many seconds. */
  timelineOffset: number
}

// Lazy-load: render a <track> element ONLY for the currently selected external sub.
// Rendering every external sub eagerly caused the browser to fetch all of them in
// parallel, which triggered HTTP 429 (rate-limit) responses from opensubtitles.
//
// The timing offset is applied IN-MEMORY by shifting each cue's start/end time —
// not by re-fetching the VTT with a new `&offset=`. Re-fetching remounted the
// <track>, which left residual cues on screen (the "bleeding" artifact) and made
// every nudge a network round-trip. Loading once and mutating cue times makes the
// offset instant and lets the browser's native cue lifecycle clear cleanly.
const SubtitleTracks = memo(({ externalSubs, proxyPort, currentSubtitle, subtitleOffset, timelineOffset }: SubtitleTracksProps) => {
  const trackRef = useRef<HTMLTrackElement>(null)
  // Pristine cue times captured on first load, so repeated offset changes always
  // shift from the original timing (never compound).
  const originalsRef = useRef<Array<{ start: number; end: number }> | null>(null)

  const selected = currentSubtitle >= 1000 ? externalSubs.find((s) => s.id === currentSubtitle) : undefined
  const cleanUrl = selected ? selected.url.replace(/^https?:\/\//, '') : ''
  const proxiedUrl = selected
    ? `http://localhost:${proxyPort}/proxy/${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}format=vtt`
    : ''

  // New subtitle source → forget the previous track's captured timings.
  useEffect(() => { originalsRef.current = null }, [proxiedUrl])

  // Capture originals once the cues parse, then (re)apply the current offset. Runs on
  // offset change too — instantly, with no network request or remount.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const applyOffset = () => {
      const cues = el.track?.cues
      if (!cues || cues.length === 0) return
      if (!originalsRef.current || originalsRef.current.length !== cues.length) {
        originalsRef.current = Array.from({ length: cues.length }, (_, i) => {
          const c = cues[i] as TextTrackCue
          return { start: c.startTime, end: c.endTime }
        })
      }
      const orig = originalsRef.current
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i] as TextTrackCue
        const o = orig[i]
        if (!o) continue
        c.startTime = Math.max(0, o.start + subtitleOffset - timelineOffset)
        c.endTime = Math.max(0, o.end + subtitleOffset - timelineOffset)
      }
    }
    applyOffset()
    el.addEventListener('load', applyOffset)
    return () => el.removeEventListener('load', applyOffset)
  }, [subtitleOffset, timelineOffset, proxiedUrl])

  if (!proxyPort || !selected) return null

  return (
    <track
      ref={trackRef}
      key={selected.id}
      id={selected.id.toString()}
      kind="subtitles"
      src={proxiedUrl}
      srcLang={selected.lang}
      label={selected.name}
      default
    />
  )
})

SubtitleTracks.displayName = 'SubtitleTracks'


export function VideoPlayer({
  content, episode, session, streamHeaders, initialProviderId, allStreams = [], profileId, resumeAtSeconds: initialResumeAt,
  onClose, onNextEpisode, nextEpisode, embedded = false, onPip,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [activeStreamUrl, setActiveStreamUrl] = useState(session.manifestUrl)
  const [activeHeaders, setActiveHeaders] = useState<Record<string, string> | undefined>(streamHeaders)
  const [activeSourceId, setActiveSourceId] = useState<string | null>(initialProviderId || null)
  const [resumeAtSeconds, setResumeAtSeconds] = useState(initialResumeAt ?? 0)

  const [sources, setSources] = useState<Array<{ id: string; name: string; enabled: boolean }>>([])
  const [switchingSource, setSwitchingSource] = useState(false)
  const [switchingError, setSwitchingError] = useState<string | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  // For progressive (remuxed) P2P torrent streams the browser can't know the total duration up
  // front — it reports the buffered end, which visibly counts up. When such a source is active we
  // substitute the known TMDB runtime so the total time shows instantly. 0 = no override (use the
  // real video.duration, e.g. HLS / direct-MP4 sources, which report duration correctly).
  const [overrideDuration, setOverrideDuration] = useState(0)
  const overrideDurationRef = useRef(0)
  overrideDurationRef.current = overrideDuration
  const knownRuntimeSecs = ((episode?.durationMins ?? content.durationMins) ?? 0) * 60
  // Progressive torrent remuxes restart ffmpeg from `?start=` on seek; the <video> timeline
  // resets to 0 while the UI shows full-movie time via this offset.
  const [torrentTimelineOffset, setTorrentTimelineOffset] = useState(0)
  const torrentTimelineOffsetRef = useRef(0)
  torrentTimelineOffsetRef.current = torrentTimelineOffset
  const torrentStreamRef = useRef<{ baseUrl: string; transcoded: boolean } | null>(null)
  // HLS proxy port for external subtitle fetches/tracks — NOT the torrent server's port.
  const [hlsProxyPort, setHlsProxyPort] = useState('')
  const [buffered, setBuffered] = useState(0)
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [levels, setLevels] = useState<Array<{ height: number; bitrate: number }>>([])
  // HLS alternate audio renditions. id maps directly to hls.js's audioTrack index.
  // -1 = the stream's default/original audio (also used when a manifest has a single track).
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; name: string; lang: string }>>([])
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1)
  const [internalSubs, setInternalSubs] = useState<Array<{ id: number; name: string; lang: string }>>([])
  const [externalSubs, setExternalSubs] = useState<Array<{ id: number; name: string; lang: string; url: string }>>([])
  const externalSubsRef = useRef<Array<{ id: number; name: string; lang: string; url: string }>>([])
  externalSubsRef.current = externalSubs

  // Deduplicate: INTERNAL HLS subs take priority over external opensubtitles for the same language.
  // Internal subs are timed against the actual stream's video timeline (same way Netflix/HBO
  // ship subtitles — encoded alongside the master video, baked into the HLS manifest), so they
  // stay lip-synced. External SRTs from opensubtitles were timed against an arbitrary release
  // and almost always drift.
  // Uses normalizeLang so that e.g. internal 'spa' matches external 'es' correctly.
  const subtitleTracks = (() => {
    const intLangs = new Set(internalSubs.map((s) => normalizeLang(s.lang)))
    const dedupedExternal = externalSubs.filter((s) => !intLangs.has(normalizeLang(s.lang)))
    return [
      ...internalSubs,
      ...dedupedExternal.map((s) => ({ id: s.id, name: s.name, lang: s.lang })),
    ]
  })()
  const [currentSubtitle, setCurrentSubtitle] = useState(-1)
  // Subtitle size is a global preference — remember the user's S/M/L choice across
  // titles and sessions via localStorage.
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'medium' | 'large'>(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('km_subtitle_size')) || ''
    return saved === 'small' || saved === 'medium' || saved === 'large' ? saved : 'medium'
  })
  const [subtitleOffset, setSubtitleOffset] = useState(0)
  const [autoSyncState, setAutoSyncState] = useState<'idle' | 'running' | 'done' | 'fail'>('idle')
  const autoSyncAbortRef = useRef<AbortController | null>(null)
  const [showControls, setShowControls] = useState(true)
  const [showNextEpisode, setShowNextEpisode] = useState(false)
  const [hlsError, setHlsError] = useState<string | null>(null)
  // Bumped to ask PlayerControls to pop open its settings panel (Source / Audio / Subtitles /
  // Quality). Used by the Stream-Error screen's "Choose another source" button so the user lands
  // back IN the player with the menu open — instead of being kicked out to the detail page.
  const [openSettingsSignal, setOpenSettingsSignal] = useState(0)
  // True from when a stream starts loading until the first frame actually plays.
  // Drives the "Loading video…" overlay so the user never stares at a black screen.
  const [initialLoading, setInitialLoading] = useState(true)
  // True while playback is stalled waiting on the network — most visibly after a
  // seek, where fetching the new position can take a while on slow CDNs. Debounced
  // so quick buffers don't flash the overlay.
  const [isBuffering, setIsBuffering] = useState(false)
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const durationRef = useRef(duration)
  durationRef.current = duration
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  // Latest subtitle selection, read inside the (rarely re-created) HLS handlers so a
  // source switch re-applies the user's choice instead of letting hls.js auto-enable
  // an internal track on top of a selected external one (which shows doubled subs).
  const currentSubtitleRef = useRef(currentSubtitle)
  currentSubtitleRef.current = currentSubtitle

  // Normalized language code of the active audio choice, read inside the (rarely re-created)
  // HLS handlers so a source switch re-selects the SAME language by code (track indices differ
  // per manifest). Empty = no explicit pick yet → fall back to the preferred-language auto-select.
  const currentAudioLangRef = useRef<string>('')

  // Automatic source fallback: remember which sources we've already given up on for
  // this title, count consecutive fatal network errors, and hold the latest fallback
  // fn in a ref so the (rarely re-created) HLS error handler always calls the current one.
  const triedSourcesRef = useRef<Set<string>>(new Set())
  const networkErrorCountRef = useRef(0)
  const autoFallbackRef = useRef<(reason: string) => void>(() => {})
  // Set once the user explicitly picks a source. While pinned, the player keeps trying to
  // recover the chosen source instead of auto-switching to a different one — important when
  // only one mirror has the content the user actually wants (e.g. the black-and-white cut).
  const userPinnedSourceRef = useRef(false)

  // Reset local state on external prop changes (e.g. initial load)
  useEffect(() => {
    setActiveStreamUrl(session.manifestUrl)
    setActiveHeaders(streamHeaders)
    setActiveSourceId(initialProviderId || null)
    setResumeAtSeconds(initialResumeAt ?? 0)
    setSwitchingError(null)
    // Fresh title/episode → forget which sources failed last time.
    triedSourcesRef.current = new Set()
    networkErrorCountRef.current = 0
    // A new title/episode is a fresh decision: clear any source the user pinned on the
    // PREVIOUS title. Without this, a manual source pick stays pinned across every later
    // title, so the auto-fallback refuses to switch off a slow/dead initial source and
    // just retries it — the "fetching takes forever / keeps buffering" symptom.
    userPinnedSourceRef.current = false
  }, [session.manifestUrl, streamHeaders, initialProviderId, initialResumeAt])

  // Register stream headers with main process so HLS.js segment requests get correct headers
  useEffect(() => {
    if (activeHeaders && Object.keys(activeHeaders).length > 0) {
      providersApi.registerStreamHeaders(activeStreamUrl, activeHeaders).catch(() => {})
    }
  }, [activeStreamUrl, activeHeaders])

  // Fetch list of available/enabled providers on mount
  useEffect(() => {
    providersApi.list()
      .then((list) => {
        setSources(list.filter((s) => s.enabled))
      })
      .catch((err) => {
        console.error('Failed to list providers:', err)
      })
  }, [])

  // Auto-dismiss switching error banner after 5s
  useEffect(() => {
    if (switchingError) {
      const timer = setTimeout(() => setSwitchingError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [switchingError])

  const getStreamRequest = useCallback(() => {
    const imdbId = content.imdbId ?? undefined
    const tmdbId = content.tmdbId ?? undefined
    if (!imdbId && !tmdbId) return null

    const req: any = {
      imdbId,
      tmdbId,
      type: content.type === 'series' ? 'tv' : 'movie',
      title: content.title,
    }

    if (content.type === 'series' && episode) {
      const seasonNumber = (() => {
        for (const s of content.seasons || []) {
          if (s.episodes.some((e) => e.id === episode.id)) {
            return s.seasonNumber
          }
        }
        return 1
      })()
      req.season = seasonNumber
      req.episode = episode.episodeNumber
    }

    return req
  }, [content, episode])

  // Cancel ref: incremented on each source switch attempt. If the value changes
  // mid-flight, the result is discarded (user pressed Cancel or started another switch).
  const switchGenRef = useRef(0)

  const cancelSourceSwitch = useCallback(() => {
    switchGenRef.current += 1
    setSwitchingSource(false)
    setSwitchingError(null)
  }, [])

  const handleSourceChange = async (providerId: string, isAuto = false) => {
    if (providerId === activeSourceId) return

    // An explicit pick (e.g. the user choosing the only black-and-white mirror) pins the
    // source so the auto-fallback never silently switches them back to a different one.
    if (!isAuto) userPinnedSourceRef.current = true

    const currentPos = videoRef.current ? videoRef.current.currentTime : 0
    const gen = ++switchGenRef.current
    setSwitchingSource(true)
    setSwitchingError(null)
    // Reset any runtime override; only a transcoded torrent (resolved below) re-enables it.
    setOverrideDuration(0)
    torrentStreamRef.current = null
    setTorrentTimelineOffset(0)

    // Fast path: use a stream already collected during the initial provider race
    const cached = allStreams.find((s) => s.providerId === providerId)
    if (cached && cached.streams.length > 0) {
      const stream = cached.streams[0]!

      // P2P torrent sources carry a magnet URL that must be resolved to a localhost MP4 URL on
      // demand (this starts the BitTorrent download). Only happens when the user actually picks
      // a torrent dub — discovery never downloads anything.
      let playUrl = stream.url
      if (playUrl.startsWith('magnet:')) {
        // Tell the torrent remux which dub to select. Prefer the language the user explicitly
        // picked (cross-source "More languages"); otherwise, if this release is tagged with a
        // single language, use that. A multi-audio release with no explicit pick → '' (ffmpeg
        // default). Without this the remux can play the wrong dub (e.g. FR when ES was picked).
        const wantLang = currentAudioLangRef.current
          || ((stream.audioLangs?.length ?? 0) === 1 ? normalizeLang(stream.audioLangs![0]!) : '')
        const res = await torrentApi.resolve(playUrl, wantLang)
        if (gen !== switchGenRef.current) return
        if (!res?.url) {
          setSwitchingError(res?.error ? `Torrent: ${res.error}` : 'Could not start this torrent. Try another source.')
          setSwitchingSource(false)
          return
        }
        const baseUrl = res.url.split('?')[0]!
        torrentStreamRef.current = { baseUrl, transcoded: !!res.transcoded }
        playUrl = res.url
        // A remuxed (non-MP4) torrent streams progressively with unknown duration — show the
        // TMDB runtime as the total instead of the buffered end ticking up. Direct-MP4 torrents
        // serve with Range and report their real duration, so no override there.
        if (res.transcoded && knownRuntimeSecs > 0) setOverrideDuration(knownRuntimeSecs)
        // NOTE: transcoded torrents always stream from 0 (createReadStream) — we do NOT resume via
        // ?start=. Restarting ffmpeg mid-file needs `-ss` on the on-disk torrent file, but WebTorrent
        // persists pieces to disk lazily (only on completion), so an early ?start= hits a file that
        // doesn't exist yet → "Video failed to load". Streaming from 0 is reliable; the player seeks
        // within the buffered region natively (see handleSeek). Switching to a dub restarts it at 0.
      }

      if (stream.headers && Object.keys(stream.headers).length > 0) {
        await providersApi.registerStreamHeaders(playUrl, stream.headers).catch(() => {})
      }
      if (gen !== switchGenRef.current) return
      setResumeAtSeconds(currentPos)
      setActiveStreamUrl(playUrl)
      setActiveHeaders(stream.headers)
      setActiveSourceId(providerId)
      setSwitchingSource(false)
      return
    }

    // Slow path: no cached stream — extract fresh from the provider
    const req = getStreamRequest()
    if (!req) {
      setSwitchingError('Content is missing metadata IDs to request stream')
      setSwitchingSource(false)
      return
    }

    try {
      // Race the IPC call against a 20s timeout so the UI never hangs forever
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000))
      const result = await Promise.race([
        providersApi.getStream(providerId, req),
        timeout,
      ])

      // If the user cancelled while we were waiting, bail out silently
      if (gen !== switchGenRef.current) return

      if (!result) {
        setSwitchingError('Timed out — server took too long to respond. Try another source.')
        setSwitchingSource(false)
        return
      }

      if (result.streams && result.streams.length > 0) {
        const winningStream = result.streams[0]
        if (winningStream.headers && Object.keys(winningStream.headers).length > 0) {
          await providersApi.registerStreamHeaders(winningStream.url, winningStream.headers).catch(() => {})
        }
        if (gen !== switchGenRef.current) return
        setResumeAtSeconds(currentPos)
        setActiveStreamUrl(winningStream.url)
        setActiveHeaders(winningStream.headers)
        setActiveSourceId(providerId)
      } else {
        setSwitchingError(result?.error || 'Provider returned no working stream.')
      }
    } catch (err) {
      if (gen !== switchGenRef.current) return
      setSwitchingError(`Failed to switch stream: ${String(err)}`)
    } finally {
      if (gen === switchGenRef.current) {
        setSwitchingSource(false)
      }
    }
  }

  // Automatically move to the next collected source when the current one can't play
  // (segments never start, buffering hangs, or fatal network errors). This is what
  // keeps playback reliable on flaky CDNs instead of spinning on "Loading video…".
  const autoFallback = (reason: string) => {
    if (switchingSource) return
    // The user pinned this source (only it has what they want). Never switch away — keep
    // trying to recover the current stream instead (the key/segment loaders retry on their own).
    if (userPinnedSourceRef.current) {
      console.warn(`[auto-fallback] ${reason} — source is user-pinned, retrying instead of switching`)
      networkErrorCountRef.current = 0
      try { hlsRef.current?.startLoad() } catch { /* noop */ }
      return
    }
    if (activeSourceId) triedSourcesRef.current.add(activeSourceId)
    // Auto-fallback only ever switches between EMBED sources (fast HLS). NEVER auto-switch into a
    // P2P torrent (`p2p-*`): they take up to ~25s of peer discovery and frequently have no peers,
    // so cycling into them is exactly the "keeps switching server source, loads forever, then
    // 'no peers found'" symptom. Torrent dubs are an explicit user choice only.
    const next = allStreams.find(
      (s) => s.providerId !== activeSourceId && !s.providerId.startsWith('p2p-')
        && !triedSourcesRef.current.has(s.providerId) && s.streams.length > 0,
    )
    if (next) {
      console.warn(`[auto-fallback] ${reason} — switching to ${next.providerName} (${next.providerId})`)
      networkErrorCountRef.current = 0
      setSwitchingError(null)
      handleSourceChange(next.providerId, true)
    } else {
      console.warn(`[auto-fallback] ${reason} — no untried sources left`)
      setInitialLoading(false)
      setHlsError('This title wouldn’t play on any available source. Please try again later or pick another source.')
    }
  }
  autoFallbackRef.current = autoFallback

  // Watchdog: give up on a source only when it's genuinely dead — never when it's just slow.
  useEffect(() => {
    if (switchingSource) return
    if (!initialLoading && !isBuffering) return

    // Initial load: no frame has played yet, so judge on elapsed time alone.
    if (initialLoading) {
      const t = setTimeout(() => autoFallbackRef.current('initial-load timeout'), 25000)
      return () => clearTimeout(t)
    }

    // Buffering mid-playback: only fall back if the buffer makes NO progress for a sustained
    // window. A slow-but-advancing source is working (just slow) and must be left alone — the
    // user may have chosen it deliberately. We track the buffered end; as long as it keeps
    // growing, we never switch away. Only a genuinely dead source (no progress for 20s) is dropped.
    let lastEnd = (() => {
      const v = videoRef.current
      return v && v.buffered.length > 0 ? v.buffered.end(v.buffered.length - 1) : 0
    })()
    let stalledMs = 0
    const STEP = 1000
    const NO_PROGRESS_LIMIT = 20000
    const iv = setInterval(() => {
      const v = videoRef.current
      if (!v) return
      const end = v.buffered.length > 0 ? v.buffered.end(v.buffered.length - 1) : 0
      if (end > lastEnd + 0.1) {
        lastEnd = end
        stalledMs = 0
      } else {
        stalledMs += STEP
        if (stalledMs >= NO_PROGRESS_LIMIT) {
          clearInterval(iv)
          autoFallbackRef.current('buffering timeout (no buffer progress)')
        }
      }
    }, STEP)
    return () => clearInterval(iv)
  }, [initialLoading, isBuffering, switchingSource, activeStreamUrl])

  // Resolve the HLS proxy port once per stream URL change. Torrent sources play from a
  // different local server, so never derive subtitle proxy port from activeStreamUrl alone.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const match = activeStreamUrl.match(/^http:\/\/localhost:(\d+)\/proxy\//)
      if (match) {
        if (!cancelled) setHlsProxyPort(match[1]!)
        return
      }
      const portNum = await window.electronAPI?.getProxyPort?.()
      if (!cancelled && portNum) setHlsProxyPort(String(portNum))
    })()
    return () => { cancelled = true }
  }, [activeStreamUrl])

  // Fetch external subtitles on content or episode change
  useEffect(() => {
    let active = true
    setExternalSubs([])

    const fetchSubtitles = async () => {
      try {
        const imdbId = content.imdbId
        if (!imdbId) return

        const isSeries = content.type === 'series' && episode
        let typePath = 'movie'
        let subQuery = imdbId

        if (isSeries) {
          typePath = 'series'
          const seasonNumber = (() => {
            for (const s of content.seasons || []) {
              if (s.episodes.some((e) => e.id === episode.id)) {
                return s.seasonNumber
              }
            }
            return 1
          })()
          subQuery = `${imdbId}:${seasonNumber}:${episode.episodeNumber}`
        }

        if (!hlsProxyPort) return

        const listUrl = `http://localhost:${hlsProxyPort}/proxy/opensubtitles-v3.strem.io/subtitles/${typePath}/${subQuery}.json`
        const res = await fetch(listUrl)
        if (!res.ok) throw new Error('Subtitles response error')
        
        const data = await res.json()
        if (!active) return

        if (data && Array.isArray(data.subtitles)) {
          const parsed = data.subtitles.map((sub: any, idx: number) => {
            const name = getCleanSubtitleName('', sub.lang)
            return {
              id: 1000 + idx, // offset to avoid clash with HLS internal subtitle IDs
              name,
              lang: sub.lang,
              url: sub.url,
            }
          })
          setExternalSubs(parsed)
        }
      } catch (err) {
        console.error('Failed to load external subtitles:', err)
      }
    }

    fetchSubtitles()

    return () => {
      active = false
    }
  }, [content.id, episode?.id, activeStreamUrl, hlsProxyPort])

  // Enable the selected subtitle track programmatically — disable ALL others to prevent duplication.
  // Three cases:
  //   -1: off → disable all text tracks
  //   0–999: internal HLS track → let hls.js manage its track; only disable external <track> elements
  //   >=1000: external sideload → enable the matching <track>, disable everything else including HLS
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const extIdSet = new Set(externalSubs.map((s) => s.id.toString()))

    const updateTracks = () => {
      if (currentSubtitle < 0) {
        // Off: disable every track
        for (let i = 0; i < video.textTracks.length; i++) {
          const t = video.textTracks[i]
          if (t) t.mode = 'disabled'
        }
      } else if (currentSubtitle >= 1000) {
        // External sideload: show the selected track, disable ALL others (including HLS internal)
        const extTrack = externalSubs.find((t) => t.id === currentSubtitle)
        for (let i = 0; i < video.textTracks.length; i++) {
          const track = video.textTracks[i]
          if (!track) continue
          if (extTrack && (track.id === extTrack.id.toString() || track.label === extTrack.name)) {
            track.mode = 'showing'
          } else {
            track.mode = 'disabled'
          }
        }
      } else {
        // Internal HLS track (0–999): hls.js manages its own track via hls.subtitleTrack.
        // Only disable external <track> elements so they can't overlap with the HLS-rendered sub.
        for (let i = 0; i < video.textTracks.length; i++) {
          const track = video.textTracks[i]
          if (!track) continue
          if (extIdSet.has(track.id)) {
            track.mode = 'disabled'
          }
        }
      }
    }

    updateTracks()
    video.textTracks.addEventListener('addtrack', updateTracks)
    return () => {
      video.textTracks.removeEventListener('addtrack', updateTracks)
    }
  }, [currentSubtitle, externalSubs])

  // Apply subtitle styling via dynamic ::cue CSS.
  // Sizes are calibrated so small/medium/large feel proportionally correct at full-screen.
  useEffect(() => {
    try { localStorage.setItem('km_subtitle_size', subtitleSize) } catch { /* noop */ }
    const sizeMap = { small: '0.85em', medium: '1.15em', large: '1.55em' }
    const styleId = 'km-subtitle-size'
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    style.textContent = [
      `video::cue {`,
      `  font-size: ${sizeMap[subtitleSize]};`,
      `  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;`,
      `}`,
    ].join('\n')
    return () => {
      const el = document.getElementById(styleId)
      if (el) el.remove()
    }
  }, [subtitleSize])

  // Init HLS or direct video
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    setHlsError(null)
    setInitialLoading(true)
    const manifestUrl = activeStreamUrl

    // Detect if this is a direct video file (MP4/WebM) vs HLS manifest
    const isDirectVideo = (() => {
      try {
        const path = new URL(manifestUrl).pathname.toLowerCase()
        return path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mkv')
      } catch {
        return false
      }
    })()

    if (isDirectVideo) {
      // Direct video — use native <video> playback, no hls.js needed
      video.src = manifestUrl
      video.addEventListener('loadedmetadata', () => {
        // Transcoded torrents seek via ?start= in the URL (timeline offset tracked separately).
        // Direct MP4/WebM torrents and other files use native Range seeking.
        if (resumeAtSeconds && resumeAtSeconds > 0 && !torrentStreamRef.current?.transcoded) {
          video.currentTime = resumeAtSeconds
        }
        video.play().catch(() => {})
      }, { once: true })
      video.addEventListener('error', () => setHlsError('Video failed to load. Try a different source.'), { once: true })
      return () => {
        video.removeAttribute('src')
        video.load()
      }
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        // Keep a deep forward buffer so a slow patch of a provider CDN doesn't drain
        // playback. hls.js fills up to maxBufferLength seconds, and beyond that up to
        // maxMaxBufferLength when the bitrate is low enough to fit inside maxBufferSize.
        // A 10-minute ceiling lets the player ride out long fetch hiccups silently.
        maxBufferLength: 60,
        maxMaxBufferLength: 600,
        maxBufferSize: 180 * 1024 * 1024,
        maxBufferHole: 0.5,
        // Stall watchdog: when the buffer goes stuck, nudge the playhead past tiny gaps
        // / discontinuities instead of freezing (the "pause to let it load" symptom).
        highBufferWatchdogPeriod: 1,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 15,
        startPosition: resumeAtSeconds && resumeAtSeconds > 0 ? resumeAtSeconds : -1,
        startLevel: -1,
        abrEwmaFastLive: 3.0,
        abrEwmaSlowLive: 9.0,
        abrEwmaFastVoD: 3.0,
        abrEwmaSlowVoD: 9.0,
        // Be patient with slow/flaky provider CDNs: more retries, longer timeouts, and
        // exponential backoff so a single slow segment doesn't escalate to a fatal error.
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 6,
        levelLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 64000,
        fragLoadingTimeOut: 30000,
        // Encryption-key loading: the default policy only retries ONCE on timeout, so a slow
        // AES-128 key fetch (common on the encrypted MovieAPI streams) gives up almost
        // immediately → keyLoadError → permanent stall. Make it as patient as fragment loading:
        // many retries, long timeouts, exponential backoff. Paired with proxying the key URL
        // (see the proxy's URI="..." rewrite), this makes encrypted sources play reliably.
        keyLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 20000,
            maxLoadTimeMs: 60000,
            timeoutRetry: { maxNumRetry: 8, retryDelayMs: 1000, maxRetryDelayMs: 8000, backoff: 'linear' },
            errorRetry: { maxNumRetry: 8, retryDelayMs: 1000, maxRetryDelayMs: 8000, backoff: 'linear' },
          },
        },
      })

      // Don't let hls.js auto-render an internal subtitle unless the user actually has
      // one selected — otherwise it stacks on top of a selected external track.
      hls.subtitleDisplay = currentSubtitleRef.current >= 0 && currentSubtitleRef.current < 1000

      hls.loadSource(manifestUrl)
      hls.attachMedia(video)

      // Play only after the browser signals it has enough data to start — avoids
      // bufferStalledError caused by calling play() before the first segment buffers.
      video.addEventListener('canplay', () => video.play().catch(() => {}), { once: true })

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const mapped = data.levels.map((l) => ({
          height: getStandardHeight(l.width || 0, l.height || 0),
          bitrate: l.bitrate
        }))
        setLevels(mapped)

        // Stay in AUTO and let ABR ramp the quality up from a safe starting level.
        // Forcing the highest resolution up-front (the previous behaviour) guaranteed a
        // buffer stall on slower provider CDNs — the very interruption we're avoiding.
        // ABR climbs to full quality on its own once the connection proves it can keep up.
        setCurrentLevel(-1)
      })

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        setInternalSubs(data.subtitleTracks.map((t) => ({ id: t.id, name: getCleanSubtitleName(t.name, t.lang ?? ''), lang: t.lang ?? '' })))
        // Re-apply the current selection. Without this, switching source lets hls.js
        // auto-enable an internal subtitle on top of a chosen external one → doubled subs.
        const sel = currentSubtitleRef.current
        if (sel >= 0 && sel < 1000) {
          hls.subtitleDisplay = true
          hls.subtitleTrack = sel
        } else {
          hls.subtitleDisplay = false
          hls.subtitleTrack = -1
        }
      })

      // Audio renditions. Only expose a chooser when the manifest actually carries more than
      // one audio track (most provider streams are single-audio → menu shows "no extra tracks").
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
        const tracks = data.audioTracks ?? []
        if (tracks.length <= 1) {
          setAudioTracks([])
          setCurrentAudioTrack(-1)
          return
        }
        // id stays the hls.js audioTrack index; the menu is ordered by language preference
        // (English → Spanish → French → …) so the most-wanted dubs sit at the top.
        const opts = tracks
          .map((t, i) => ({ id: i, name: getCleanAudioName(t.name, t.lang ?? ''), lang: t.lang ?? '' }))
          .sort((a, b) => audioLangRank(a.lang) - audioLangRank(b.lang))
        setAudioTracks(opts)

        // Decide which track plays. Priority: (1) re-select the user's previously chosen
        // LANGUAGE if this manifest has it (survives source switches), (2) auto-select the
        // most-preferred available language, (3) fall back to hls.js's default rendition.
        const wantLang = currentAudioLangRef.current
        let idx = wantLang ? tracks.findIndex((t) => normalizeLang(t.lang ?? '') === wantLang) : -1
        if (idx < 0) idx = preferredAudioIndex(tracks)
        if (idx < 0) idx = hls.audioTrack >= 0 ? hls.audioTrack : 0
        hls.audioTrack = idx
        setCurrentAudioTrack(idx)
        currentAudioLangRef.current = normalizeLang(tracks[idx]?.lang ?? '')
      })

      // Keep UI state in sync if hls.js switches the audio track on its own. `hls.audioTrack`
      // is the authoritative selected index (data.id is a playlist id, not the list index).
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
        if (hls.audioTracks.length > 1) setCurrentAudioTrack(hls.audioTrack)
      })

      // LEVEL_SWITCHED reports the ABR-chosen level. We deliberately do NOT mirror that
      // into `currentLevel` state: when the user selected AUTO, the UI must keep saying
      // "AUTO" even as the ABR picks 720p / 1080p / etc. behind the scenes.
      // `currentLevel` represents user intent (-1 auto, n = locked tier).
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        playbackApi.reportQuality(
          {
            sessionId: session.sessionId,
            contentId: content.id,
            episodeId: episode?.id,
            quality: `${data.level}`,
            positionSeconds: currentTimeRef.current,
            durationSeconds: durationRef.current,
            bandwidth: hls.bandwidthEstimate,
          },
          profileId
        ).catch(() => {})
      })

      // ── Non-fatal stall handling ───────────────────────────────────────────
      // Some provider CDNs deliver fragments at (or below) real-time, draining the buffer
      // mid-playback (bufferStalledError / fragLoadTimeOut). These are NON-FATAL: hls.js
      // recovers on its own and the browser shows the buffering spinner until data arrives.
      // We let it ride — a gentle loader kick in case fetching stopped, and nothing else.
      // (An earlier "auto-rebuffer-to-goal" that PAUSED playback to build an 8–30s cushion
      // made playback feel constantly stuck and was removed — see DN-035/DN-042. ABR already
      // adapts quality to throughput; we never force the bitrate down on a stall.)
      let keyErrorCount = 0

      // Log ALL hls.js errors — non-fatal demux/parse errors are silently swallowed by
      // the recovery handler below and are usually what causes "duration shown, 0:00 stuck".
      hls.on(Hls.Events.ERROR, (_, data) => {
        console.warn('[hls ERROR]', {
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          reason: (data as any).reason,
          response: data.response ? { code: data.response.code, text: data.response.text } : undefined,
          frag: data.frag ? { sn: (data.frag as any).sn, url: data.frag.url?.slice(0, 140) } : undefined,
        })
        if (!data.fatal) {
          if (
            data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR
          ) {
            // Kick the loader in case it stopped fetching; let hls.js + the browser handle the
            // stall naturally (no forced pause).
            try { hls.startLoad() } catch { /* noop */ }
          } else if (
            data.details === Hls.ErrorDetails.KEY_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.KEY_LOAD_TIMEOUT
          ) {
            // The HLS decryption key won't load — segments can't be decrypted, so quality
            // capping / nudging can't help (this is the MovieAPI failure mode). The source
            // is effectively dead; after a couple of failures, jump to the next collected
            // source rather than spinning on a permanent stall.
            if (++keyErrorCount >= 2) autoFallbackRef.current('key load error')
          }
          return
        }
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Try to recover a couple of times; if the source keeps failing to
            // deliver segments (e.g. a CDN returning empty ranges), stop looping and
            // fall back to the next collected source instead of spinning forever.
            networkErrorCountRef.current++
            if (networkErrorCountRef.current > 2) {
              autoFallbackRef.current('fatal network error')
            } else {
              hls.startLoad()
            }
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            // Try to recover media errors
            hls.recoverMediaError()
            break
          default:
            // hls.js can't handle this URL — try native <video> as a last resort
            // (covers cases where the URL is actually a direct video file or non-standard HLS)
            hls.destroy()
            hlsRef.current = null
            video.src = manifestUrl
            video.play().catch(() => {})
            video.addEventListener('error', () => {
              setHlsError('Stream failed to load. Try choosing a different source.')
            }, { once: true })
            break
        }
      })

      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifestUrl
      video.addEventListener('loadedmetadata', () => video.play().catch(() => {}))
      video.addEventListener('error', () => setHlsError('Video failed to load. Try a different source.'))
    }

    return () => {
      // Disable the internal subtitle before teardown so it can't linger in a
      // 'showing' state and double up with the next source's subtitles.
      try { if (hlsRef.current) hlsRef.current.subtitleTrack = -1 } catch { /* noop */ }
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [activeStreamUrl, resumeAtSeconds])

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Sync initial states from video element on mount or url change
    setIsPlaying(!video.paused)
    setIsMuted(video.muted)
    setVolume(video.volume)
    setCurrentTime(video.currentTime)
    setDuration(isNaN(video.duration) ? 0 : video.duration)
    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1))
    } else {
      setBuffered(0)
    }

    const showBufferingSoon = () => {
      if (bufferingTimerRef.current) return
      bufferingTimerRef.current = setTimeout(() => {
        bufferingTimerRef.current = null
        setIsBuffering(true)
      }, 250)
    }
    const clearBuffering = () => {
      if (bufferingTimerRef.current) {
        clearTimeout(bufferingTimerRef.current)
        bufferingTimerRef.current = null
      }
      setIsBuffering(false)
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => { setIsPlaying(false); clearBuffering() }
    // First frame is actually rendering — drop the loading overlays and reset the
    // network-error streak (the source is clearly working now).
    const onPlaying = () => {
      setIsPlaying(true); setInitialLoading(false); clearBuffering()
      networkErrorCountRef.current = 0
    }
    const onCanPlay = () => clearBuffering()
    // Buffering is left to hls.js + the browser — we only show the spinner. We do NOT
    // proactively pause playback to build a cushion: that "auto-rebuffer-to-goal" (v1.1.5)
    // made playback feel constantly stuck, so it was removed (see DN-035/DN-042). hls.js
    // keeps a deep forward buffer; the browser stalls only when it's truly empty and resumes
    // when data arrives. The progress-aware watchdog still switches a source that makes no
    // buffer progress at all.
    const onWaiting = () => showBufferingSoon()
    const onSeeking = () => showBufferingSoon()
    const onStalled = () => showBufferingSoon()
    const onTimeUpdate = () => {
      const offset = torrentStreamRef.current?.transcoded ? torrentTimelineOffsetRef.current : 0
      const displayTime = video.currentTime + offset
      setCurrentTime(displayTime)
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1) + offset)
      }

      const total = overrideDurationRef.current > 0 ? overrideDurationRef.current : video.duration
      if (nextEpisode && total > 0 && total - displayTime < 30) {
        setShowNextEpisode(true)
      }
    }
    const onDurationChange = () => setDuration(isNaN(video.duration) ? 0 : video.duration)
    const onLoadedMetadata = () => setDuration(isNaN(video.duration) ? 0 : video.duration)
    const onVolumeChange = () => { setIsMuted(video.muted); setVolume(video.volume) }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('volumechange', onVolumeChange)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('volumechange', onVolumeChange)
      if (bufferingTimerRef.current) {
        clearTimeout(bufferingTimerRef.current)
        bufferingTimerRef.current = null
      }
    }
  }, [nextEpisode, activeStreamUrl])

  // Heartbeat every 10s
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      if (!videoRef.current) return
      // Prefer the runtime override (progressive torrents report a growing, unreliable duration).
      const dur = overrideDurationRef.current > 0
        ? Math.floor(overrideDurationRef.current)
        : Math.floor(videoRef.current.duration || 0)
      if (dur <= 0) return // Skip heartbeat until video duration metadata is loaded and positive
      playbackApi.heartbeat(
        {
          contentId: content.id,
          episodeId: episode?.id,
          sessionId: session.sessionId,
          positionSeconds: Math.floor(currentTimeRef.current),
          durationSeconds: dur,
          quality: currentLevel === -1 ? 'auto' : `${levels[currentLevel]?.height}p`,
        },
        profileId
      ).catch((err) => {
        console.error('[VideoPlayer] Heartbeat failed:', err)
      })
    }, 10000)

    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
  }, [content.id, episode?.id, session.sessionId, profileId, currentLevel, levels])

  // Save final position on unmount to prevent progress loss
  useEffect(() => {
    return () => {
      const video = videoRef.current
      const pos = video ? Math.floor(video.currentTime) : Math.floor(currentTimeRef.current)
      const dur = overrideDurationRef.current > 0
        ? Math.floor(overrideDurationRef.current)
        : (video ? Math.floor(video.duration || 0) : Math.floor(durationRef.current))
      
      if (pos > 0 && dur > 0) {
        playbackApi.heartbeat(
          {
            contentId: content.id,
            episodeId: episode?.id,
            sessionId: session.sessionId,
            positionSeconds: pos,
            durationSeconds: dur,
            quality: 'auto',
          },
          profileId
        ).catch((err) => {
          console.error('[VideoPlayer] Final unmount heartbeat failed:', err)
        })
      }
    }
  }, [content.id, episode?.id, session.sessionId, profileId])

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  useEffect(() => {
    resetControlsTimeout()
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current) }
  }, [])

  // Recovering from a Stream Error opens the settings menu (see the hlsError screen). The video is
  // paused/dead at that point, so PIN the controls open instead of letting the 3s auto-hide fade
  // the menu out from under the user. Normal mouse movement resumes the auto-hide cycle.
  useEffect(() => {
    if (openSettingsSignal > 0) {
      setShowControls(true)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [openSettingsSignal])

  const handlePlayPause = () => {
    const video = videoRef.current
    if (!video) return
    isPlaying ? video.pause() : video.play()
  }
  const handleMute = () => { if (videoRef.current) videoRef.current.muted = !isMuted }
  const handleVolumeChange = (v: number) => {
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0 }
  }
  const handleSeek = useCallback((t: number) => {
    const video = videoRef.current
    if (!video) return
    const max = overrideDurationRef.current > 0
      ? overrideDurationRef.current
      : (isNaN(video.duration) ? 0 : video.duration)
    const target = Math.max(0, Math.min(t, max > 0 ? max : t))

    const ts = torrentStreamRef.current
    if (ts?.transcoded) {
      // Progressive remux: served HTTP 200 with no Range support, so a native `video.currentTime`
      // seek makes Chromium re-request from byte 0 → ffmpeg restarts → the movie RESETS. Instead we
      // RELOAD at the seek point: `?start=<sec>&dur=<total>`. The server maps the time to a byte
      // offset, DOWNLOADS that region (so you can jump anywhere — including the middle — not just to
      // already-buffered points) and `-ss` there. We track a timeline offset so the clock/scrub bar
      // stay on full-movie time, so the jump never resets to 0. While the server fetches the target
      // region the player shows its buffering spinner; the source is pinned so it won't auto-switch.
      setTorrentTimelineOffset(target)
      setCurrentTime(target)
      const url = new URL(ts.baseUrl)
      url.searchParams.set('start', String(Math.floor(target)))
      if (max > 0) url.searchParams.set('dur', String(Math.floor(max)))
      const wasPlaying = !video.paused
      video.src = url.toString()
      video.load()
      if (wasPlaying) video.play().catch(() => {})
      return
    }
    video.currentTime = target
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (!video) return
      resetControlsTimeout()
      const max = overrideDurationRef.current > 0
        ? overrideDurationRef.current
        : (isNaN(video.duration) ? 0 : video.duration)
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); isPlaying ? video.pause() : video.play(); break
        case 'ArrowLeft': handleSeek(Math.max(0, currentTimeRef.current - 10)); break
        case 'ArrowRight': handleSeek(max > 0 ? Math.min(max, currentTimeRef.current + 10) : currentTimeRef.current + 10); break
        case 'ArrowUp': video.volume = Math.min(1, video.volume + 0.1); break
        case 'ArrowDown': video.volume = Math.max(0, video.volume - 0.1); break
        case 'm': video.muted = !video.muted; break
        case 'f': handleFullscreen(); break
        case 'Escape': onClose(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPlaying, resetControlsTimeout, onClose, handleSeek])

  const handleLevelChange = (l: number) => { if (hlsRef.current) hlsRef.current.currentLevel = l; setCurrentLevel(l) }
  // Switch the active audio language. id is the hls.js audioTrack index (-1 = original/default).
  // If the requested track is somehow gone, fall back to the most-preferred available language,
  // then to the first track. Records the chosen language so source switches can re-select it.
  const handleAudioTrackChange = (id: number) => {
    const hls = hlsRef.current
    if (!hls) { setCurrentAudioTrack(id); return }
    const tracks = hls.audioTracks ?? []
    let next = id
    if (next < 0 || next >= tracks.length) {
      next = preferredAudioIndex(tracks)
      if (next < 0) next = tracks.length > 0 ? 0 : -1
    }
    if (next >= 0) hls.audioTrack = next
    setCurrentAudioTrack(next)
    currentAudioLangRef.current = next >= 0 ? normalizeLang(tracks[next]?.lang ?? '') : ''
  }

  // Play a dub in the requested language, trying every collected source that carries it — in
  // priority order — until one actually STARTS. Embed sources (reliable HLS) are tried before
  // torrent releases; among torrents, discovery already ordered them best-seeded first. When a
  // torrent finds no peers (resolve returns an error), we fall straight through to the next
  // release instead of dead-ending — this is what makes Spanish "just work" rather than failing on
  // the first release that happens to have no seeders. The pick is pinned so the auto-fallback
  // never yanks the user off the dub they chose (DN-038). We never fabricate or merge audio across
  // providers — we route to a source that genuinely ships the dub (DN-041).
  const tryPlayDub = async (lang: string, preferredSourceId?: string) => {
    const norm = normalizeLang(lang)
    const candidates = allStreams
      .filter((s) => s.providerId !== activeSourceId
        && (s.streams[0]?.audioLangs ?? []).map(normalizeLang).includes(norm))
      .sort((a, b) => {
        if (preferredSourceId) {
          if (a.providerId === preferredSourceId) return -1
          if (b.providerId === preferredSourceId) return 1
        }
        // Embeds before torrents; keep discovery order within each group.
        return Number(a.providerId.startsWith('p2p-')) - Number(b.providerId.startsWith('p2p-'))
      })
      .slice(0, 6)
    if (candidates.length === 0) return

    userPinnedSourceRef.current = true
    currentAudioLangRef.current = norm
    const langLabel = getCleanAudioName('', norm)
    const currentPos = videoRef.current ? videoRef.current.currentTime : 0
    const gen = ++switchGenRef.current
    setSwitchingSource(true)
    setSwitchingError(null)
    setOverrideDuration(0)
    torrentStreamRef.current = null
    setTorrentTimelineOffset(0)

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]!
      const stream = cand.streams[0]
      if (!stream) continue
      let playUrl = stream.url

      if (playUrl.startsWith('magnet:')) {
        if (i > 0) setSwitchingError(`Trying another ${langLabel} source…`)
        const res = await torrentApi.resolve(playUrl, norm)
        if (gen !== switchGenRef.current) return
        if (!res?.url) {
          // No peers / failed — try the next collected release of the same language.
          if (i < candidates.length - 1) continue
          setSwitchingError(res?.error ? `Torrent: ${res.error}` : `No working ${langLabel} source found.`)
          setSwitchingSource(false)
          return
        }
        const baseUrl = res.url.split('?')[0]!
        torrentStreamRef.current = { baseUrl, transcoded: !!res.transcoded }
        playUrl = res.url
        if (res.transcoded && knownRuntimeSecs > 0) setOverrideDuration(knownRuntimeSecs)
        // Transcoded dubs stream from 0 (no ?start= resume — the on-disk file isn't written yet for
        // an early -ss seek). Switching to a dub restarts it at 0; native in-buffer seek thereafter.
      }

      if (stream.headers && Object.keys(stream.headers).length > 0) {
        await providersApi.registerStreamHeaders(playUrl, stream.headers).catch(() => {})
      }
      if (gen !== switchGenRef.current) return
      setResumeAtSeconds(currentPos)
      setActiveStreamUrl(playUrl)
      setActiveHeaders(stream.headers)
      setActiveSourceId(cand.providerId)
      setSwitchingError(null)
      setSwitchingSource(false)
      return
    }
  }

  // Select a dub that lives on a DIFFERENT collected source (cross-provider language switch).
  // Delegates to tryPlayDub, which falls through to the next release of the same language if the
  // chosen one has no peers — so a Spanish pick keeps trying until one actually streams.
  const handleCrossSourceAudio = (lang: string, sourceId: string) => {
    void tryPlayDub(lang, sourceId)
  }

  // Dub languages available on OTHER collected sources that the CURRENT source doesn't carry,
  // so the Audio menu can offer "more languages" sourced from a different provider. Deduped by
  // language and ordered by the same preference list as in-source tracks.
  const crossSourceAudio = useMemo(() => {
    const seen = new Set(audioTracks.map((t) => normalizeLang(t.lang)))
    const out: Array<{ lang: string; label: string; sourceId: string; sourceName: string }> = []
    for (const s of allStreams) {
      if (s.providerId === activeSourceId) continue
      for (const code of s.streams[0]?.audioLangs ?? []) {
        const norm = normalizeLang(code)
        if (!norm || seen.has(norm)) continue
        seen.add(norm)
        out.push({
          lang: norm,
          label: getCleanAudioName('', norm),
          sourceId: s.providerId,
          sourceName: sources.find((x) => x.id === s.providerId)?.name ?? s.providerName,
        })
      }
    }
    return out.sort((a, b) => audioLangRank(a.lang) - audioLangRank(b.lang))
  }, [audioTracks, allStreams, activeSourceId, sources])

  // Source list shown in the switcher = registered embed providers PLUS any collected stream
  // whose providerId isn't a registered provider (e.g. Real-Debrid torrent sources, id 'rd-*').
  // Without this, debrid sources would be in availableSourceIds but never render (the switcher
  // only shows entries that exist in `sources`).
  const mergedSources = useMemo(() => {
    const ids = new Set(sources.map((s) => s.id))
    const seen = new Set<string>()
    const extra = allStreams
      .filter((s) => !ids.has(s.providerId) && !seen.has(s.providerId) && seen.add(s.providerId))
      .map((s) => ({ id: s.providerId, name: s.providerName, enabled: true }))
    return [...sources, ...extra]
  }, [sources, allStreams])
  const handleSubtitleChange = (id: number) => {
    setCurrentSubtitle(id)
    if (hlsRef.current) {
      if (id >= 0 && id < 1000) {
        // Internal HLS track: hls.js owns rendering. Setting `subtitleTrack` causes hls.js
        // to flip the corresponding TextTrack to 'showing'. We deliberately do NOT loop
        // through video.textTracks afterward — doing so used to immediately disable the
        // very track hls.js just enabled, leaving the user with no subtitles. The
        // currentSubtitle useEffect below disables external <track> elements as needed.
        hlsRef.current.subtitleDisplay = true
        hlsRef.current.subtitleTrack = id
      } else {
        // External or off: tell hls.js to stop rendering its internal subs. The useEffect
        // will then enable the selected external track (or leave all disabled for 'off').
        hlsRef.current.subtitleDisplay = false
        hlsRef.current.subtitleTrack = -1
      }
    }
  }

  // Estimate and apply the right subtitle offset automatically by correlating speech
  // (audio energy VAD) with the subtitle cue timeline. Opt-in and fail-safe: it only
  // applies an offset when it finds a confident match, otherwise it leaves things be.
  const handleAutoSync = useCallback(async () => {
    const video = videoRef.current
    if (!video || currentSubtitle < 1000) return

    // Find the selected external subtitle track and its cues.
    let track: TextTrack | null = null
    for (let i = 0; i < video.textTracks.length; i++) {
      const t = video.textTracks[i]
      if (t && t.id === currentSubtitle.toString()) { track = t; break }
    }
    if (!track) {
      const sel = externalSubs.find((s) => s.id === currentSubtitle)
      if (sel) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const t = video.textTracks[i]
          if (t && t.label === sel.name) { track = t; break }
        }
      }
    }
    const domCues = track?.cues
    if (!domCues || domCues.length === 0) {
      setAutoSyncState('fail')
      window.setTimeout(() => setAutoSyncState('idle'), 3500)
      return
    }

    // The DOM cue times already include the applied offset — strip it to get originals.
    const cues: SubCue[] = []
    for (let i = 0; i < domCues.length; i++) {
      const c = domCues[i] as TextTrackCue
      cues.push({ start: c.startTime - subtitleOffset, end: c.endTime - subtitleOffset })
    }

    // VAD needs audio actually playing to read energy.
    if (video.paused) video.play().catch(() => {})

    autoSyncAbortRef.current?.abort()
    const controller = new AbortController()
    autoSyncAbortRef.current = controller
    setAutoSyncState('running')
    try {
      const result = await autoSyncSubtitles(video, cues, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (result) {
        setSubtitleOffset(result.offset)
        setAutoSyncState('done')
      } else {
        setAutoSyncState('fail')
      }
    } catch {
      if (!controller.signal.aborted) setAutoSyncState('fail')
    } finally {
      if (autoSyncAbortRef.current === controller) autoSyncAbortRef.current = null
      window.setTimeout(() => setAutoSyncState((s) => (s === 'running' ? s : 'idle')), 3500)
    }
  }, [currentSubtitle, subtitleOffset, externalSubs])

  // Abort any in-flight analysis on unmount.
  useEffect(() => () => autoSyncAbortRef.current?.abort(), [])

  const handleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen()
    else document.exitFullscreen()
  }

  // HLS error state. "Choose another source" must NOT close the player (that dumped the user back
  // to the detail page — see bug report). It clears the error, drops the loading overlay, and asks
  // PlayerControls to open its settings panel (Source / Audio / Subtitles / Quality) so the user
  // can pick another source/dub right where they are.
  if (hlsError) {
    const chooseAnotherSource = () => {
      setHlsError(null)
      setInitialLoading(false)
      setSwitchingError(null)
      setOpenSettingsSignal((n) => n + 1)
    }
    return (
      <div className={`${embedded ? 'absolute' : 'fixed'} inset-0 bg-black z-50 flex items-center justify-center`}>
        <div className="text-center max-w-md px-6">
          <p className="text-white/50 text-4xl mb-4">⚠</p>
          <p className="text-white font-semibold mb-2">Stream Error</p>
          <p className="text-white/60 text-sm mb-6">{hlsError}</p>
          <button
            onClick={chooseAnotherSource}
            className="bg-white/10 border border-white/20 text-white px-6 py-2.5 rounded-lg hover:bg-white/20 transition-colors"
          >
            ← Choose Another Source
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`${embedded ? 'absolute' : 'fixed'} inset-0 bg-black z-50`}
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      {/* Close button (hidden in PiP — the PiP chrome supplies its own) */}
      {!embedded && (
      <button
        onClick={onClose}
        className={`absolute top-4 right-4 z-30 text-white/70 hover:text-white transition-opacity duration-300 flex items-center justify-center ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      )}

      {/* Title */}
      {!embedded && (
      <div className={`absolute top-4 left-4 z-30 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-white font-semibold">{content.title}</p>
        {episode && (
          <p className="text-white/60 text-sm">
            S{content.seasons.find((s) => s.episodes.some((e) => e.id === episode.id))?.seasonNumber}
            E{episode.episodeNumber} — {episode.title}
          </p>
        )}
      </div>
      )}

      {/* Initial buffering overlay — shown until the first frame plays so the
          user sees progress instead of a black screen while the stream loads. */}
      {initialLoading && !switchingSource && !hlsError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black pointer-events-none">
          <div className="w-10 h-10 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mb-4" />
          <p className="text-white/80 text-sm font-semibold">Loading video…</p>
          <p className="text-white/40 text-xs mt-1">Fetching the stream, this can take a few seconds</p>
        </div>
      )}

      {/* Buffering / seek overlay — shown when playback stalls on the network
          (most visibly after seeking on a slow CDN) so the user knows it's working. */}
      {isBuffering && !initialLoading && !switchingSource && !hlsError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/55 px-8 py-6 backdrop-blur-sm">
            <div className="w-9 h-9 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin" />
            <p className="text-white/80 text-xs font-medium">Loading…</p>
          </div>
        </div>
      )}

      {/* Switch Source Loading Overlay */}
      {switchingSource && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center pointer-events-auto">
          <div className="w-10 h-10 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mb-4" />
          <p className="text-white text-sm font-semibold mb-5">Switching server source...</p>
          <button
            onClick={cancelSourceSwitch}
            className="px-5 py-2 text-xs font-semibold text-white/80 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 hover:text-white transition-all duration-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Switch Source Error Banner */}
      {switchingError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-4 py-2.5 rounded-lg border border-red-400/20 shadow-2xl z-40 flex items-center gap-2 backdrop-blur-md">
          <span>⚠</span>
          <span>{switchingError}</span>
          <button onClick={() => setSwitchingError(null)} className="ml-2 hover:opacity-80 font-bold">×</button>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
        crossOrigin="anonymous"
        onClick={handlePlayPause}
        disablePictureInPicture
      >
        <SubtitleTracks
          externalSubs={externalSubs}
          proxyPort={hlsProxyPort}
          currentSubtitle={currentSubtitle}
          subtitleOffset={subtitleOffset}
          timelineOffset={torrentTimelineOffset}
        />
      </video>

      {showNextEpisode && nextEpisode && (
        <NextEpisodeOverlay
          nextEpisode={nextEpisode}
          onPlay={() => { setShowNextEpisode(false); onNextEpisode?.(nextEpisode) }}
          onDismiss={() => setShowNextEpisode(false)}
        />
      )}

      {!embedded && (
      <div className={`transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <PlayerControls
          hls={hlsRef.current}
          isPlaying={isPlaying}
          isMuted={isMuted}
          volume={volume}
          currentTime={currentTime}
          duration={overrideDuration > 0 ? overrideDuration : duration}
          buffered={buffered}
          currentLevel={currentLevel}
          levels={levels}
          subtitleTracks={subtitleTracks}
          currentSubtitle={currentSubtitle}
          subtitleSize={subtitleSize}
          subtitleOffset={subtitleOffset}
          onSubtitleOffsetChange={setSubtitleOffset}
          onAutoSync={handleAutoSync}
          autoSyncState={autoSyncState}
          onPlayPause={handlePlayPause}
          onMute={handleMute}
          onVolumeChange={handleVolumeChange}
          onSeek={handleSeek}
          onLevelChange={handleLevelChange}
          audioTracks={audioTracks}
          currentAudioTrack={currentAudioTrack}
          onAudioTrackChange={handleAudioTrackChange}
          crossSourceAudio={crossSourceAudio}
          onCrossSourceAudio={handleCrossSourceAudio}
          onSubtitleChange={handleSubtitleChange}
          onSubtitleSizeChange={setSubtitleSize}
          onFullscreen={handleFullscreen}
          introEndSecs={episode?.introEndSecs ?? content.introEndSecs ?? null}
          creditsStartSecs={episode?.creditsStartSecs ?? content.creditsStartSecs ?? null}
          sources={mergedSources}
          availableSourceIds={allStreams.map((s) => s.providerId)}
          audioLangsBySource={Object.fromEntries(
            allStreams
              .map((s) => [s.providerId, s.streams[0]?.audioLangs ?? []] as const)
              .filter(([, langs]) => langs.length >= 1),
          )}
          activeSourceId={activeSourceId}
          onSourceChange={handleSourceChange}
          switchingSource={switchingSource}
          nextEpisode={nextEpisode}
          onNextEpisode={(ep) => { setShowNextEpisode(false); onNextEpisode?.(ep) }}
          onPip={onPip}
          openSettingsSignal={openSettingsSignal}
        />
      </div>
      )}
    </div>
  )
}
