import { useRef, useState, useEffect, useCallback, memo } from 'react'
import Hls from 'hls.js'
import type { ContentDetail, Episode } from '../../api/catalog'
import type { PlaybackSession } from '../../api/playback'
import { playbackApi } from '../../api/playback'
import { providersApi } from '../../api/providers'
import { PlayerControls } from './PlayerControls'
import { NextEpisodeOverlay } from './NextEpisodeOverlay'
import { autoSyncSubtitles, type SubCue } from '../../lib/subtitleAutoSync'

interface CachedStream {
  providerId: string
  providerName: string
  streams: Array<{ url: string; quality: string; headers?: Record<string, string> }>
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

interface SubtitleTracksProps {
  externalSubs: Array<{ id: number; name: string; lang: string; url: string }>
  proxyPort: string
  currentSubtitle: number
  subtitleOffset: number
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
const SubtitleTracks = memo(({ externalSubs, proxyPort, currentSubtitle, subtitleOffset }: SubtitleTracksProps) => {
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
        c.startTime = Math.max(0, o.start + subtitleOffset)
        c.endTime = Math.max(0, o.end + subtitleOffset)
      }
    }
    applyOffset()
    el.addEventListener('load', applyOffset)
    return () => el.removeEventListener('load', applyOffset)
  }, [subtitleOffset, proxiedUrl])

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
  const [buffered, setBuffered] = useState(0)
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [levels, setLevels] = useState<Array<{ height: number; bitrate: number }>>([])
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
  // True from when a stream starts loading until the first frame actually plays.
  // Drives the "Loading video…" overlay so the user never stares at a black screen.
  const [initialLoading, setInitialLoading] = useState(true)
  // True while playback is stalled waiting on the network — most visibly after a
  // seek, where fetching the new position can take a while on slow CDNs. Debounced
  // so quick buffers don't flash the overlay.
  const [isBuffering, setIsBuffering] = useState(false)
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Auto-rebuffer-to-goal ────────────────────────────────────────────────────
  // Some provider CDNs deliver segments at (or below) real-time, so the buffer drains
  // as fast as it fills — the classic "play a second, freeze, play a second" stutter
  // (e.g. MovieAPI on certain episodes). Rather than stutter-loop, when the buffer runs
  // dry we PAUSE once and resume only after a healthy forward cushion has built — exactly
  // what a user does by hand when they pause to "let it load". The goal grows on repeated
  // stalls, so a chronically slow source ends up building one big buffer and then playing
  // straight through. This is bandwidth-agnostic: ABR still picks the quality, this just
  // governs when playback is allowed to run.
  const rebufferingRef = useRef(false)
  const rebufferGoalRef = useRef(8) // seconds of forward buffer required to (re)start
  const rebufferTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastResumeWallRef = useRef(0)
  const hasPlayedRef = useRef(false) // don't rebuffer before the first frame ever plays
  const startRebufferRef = useRef<() => void>(() => {})
  const cancelRebufferRef = useRef<() => void>(() => {})

  const durationRef = useRef(duration)
  durationRef.current = duration
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime
  // Read inside the rarely-recreated rebuffer trigger so it never sees a stale value.
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  // Latest subtitle selection, read inside the (rarely re-created) HLS handlers so a
  // source switch re-applies the user's choice instead of letting hls.js auto-enable
  // an internal track on top of a selected external one (which shows doubled subs).
  const currentSubtitleRef = useRef(currentSubtitle)
  currentSubtitleRef.current = currentSubtitle

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

    // Fast path: use a stream already collected during the initial provider race
    const cached = allStreams.find((s) => s.providerId === providerId)
    if (cached && cached.streams.length > 0) {
      const stream = cached.streams[0]!
      if (stream.headers && Object.keys(stream.headers).length > 0) {
        await providersApi.registerStreamHeaders(stream.url, stream.headers).catch(() => {})
      }
      if (gen !== switchGenRef.current) return
      setResumeAtSeconds(currentPos)
      setActiveStreamUrl(stream.url)
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
    const next = allStreams.find(
      (s) => s.providerId !== activeSourceId && !triedSourcesRef.current.has(s.providerId) && s.streams.length > 0,
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
    // window. A slow-but-advancing source (e.g. MovieAPI building a cushion during a rebuffer)
    // is working and must be left alone — the user may have chosen it deliberately. We track
    // the buffered end; as long as it keeps growing, we never switch away.
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

        // Parse proxy port from session manifest URL, or fallback to the main process proxy port
        let proxyPort = ''
        const match = activeStreamUrl.match(/^http:\/\/localhost:(\d+)\//)
        if (match) {
          proxyPort = match[1]!
        } else if (window.electronAPI?.getProxyPort) {
          const portNum = await window.electronAPI.getProxyPort()
          if (portNum) proxyPort = String(portNum)
        }

        if (!proxyPort) return

        const listUrl = `http://localhost:${proxyPort}/proxy/opensubtitles-v3.strem.io/subtitles/${typePath}/${subQuery}.json`
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
  }, [content.id, episode?.id, activeStreamUrl])

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
        if (resumeAtSeconds && resumeAtSeconds > 0) video.currentTime = resumeAtSeconds
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

      // ── Buffer-stall recovery ──────────────────────────────────────────────
      // Some provider CDNs deliver fragments at (or below) real-time, draining the buffer
      // mid-playback (bufferStalledError / fragLoadTimeOut). These arrive as NON-FATAL
      // errors that hls.js retries on its own; we add two things. (1) A loader kick in case
      // it stopped fetching. (2) Hand off to the auto-rebuffer-to-goal controller so
      // playback waits for a real forward cushion instead of stutter-looping. We deliberately
      // do NOT force the bitrate down: ABR already adapts quality to the measured throughput,
      // and on a provider-bound stall (where the client has bandwidth to spare) dropping
      // quality doesn't help — building a buffer does.
      let keyErrorCount = 0

      const onStall = (reason: string) => {
        console.warn(`[hls] ${reason} — kicking loader + rebuffering`)
        try { hls.startLoad() } catch { /* noop */ }
        startRebufferRef.current()
      }

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
          // Non-fatal stalls/timeouts are the #1 cause of stuttering playback — recover
          // actively instead of waiting for them to escalate into a fatal failure.
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) onStall('bufferStalledError')
          else if (
            data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR
          ) onStall('fragLoadTimeOut')
          else if (
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

    // Seconds of contiguous buffer ahead of the playhead (0 if the playhead sits in a gap).
    const bufferAhead = () => {
      const t = video.currentTime
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) - 0.25 <= t && t < video.buffered.end(i)) {
          return video.buffered.end(i) - t
        }
      }
      return 0
    }

    const endRebuffer = () => {
      if (rebufferTimerRef.current) { clearInterval(rebufferTimerRef.current); rebufferTimerRef.current = null }
      if (!rebufferingRef.current) return
      rebufferingRef.current = false
      lastResumeWallRef.current = Date.now()
      setIsBuffering(false)
      video.play().catch(() => {})
    }

    const cancelRebuffer = () => {
      if (rebufferTimerRef.current) { clearInterval(rebufferTimerRef.current); rebufferTimerRef.current = null }
      rebufferingRef.current = false
    }
    cancelRebufferRef.current = cancelRebuffer

    // Pause once and resume only after a healthy forward buffer has built — turning a
    // stutter-storm on a slow provider into a single, deliberate wait.
    const startRebuffer = () => {
      if (rebufferingRef.current) return
      if (!hasPlayedRef.current) return           // initial load is handled elsewhere
      if (video.ended || video.seeking) return
      if (video.paused && !isPlayingRef.current) return // genuinely user-paused → leave it

      // Re-stalling soon after a resume means this source needs a deeper cushion: grow the
      // goal so we wait longer (and thus less often). Caps at 30s. A calm stretch resets it.
      const sinceResume = Date.now() - lastResumeWallRef.current
      if (lastResumeWallRef.current > 0 && sinceResume < 25000) {
        rebufferGoalRef.current = Math.min(30, rebufferGoalRef.current + 6)
      }
      const goal = rebufferGoalRef.current

      rebufferingRef.current = true
      setIsBuffering(true)
      try { hlsRef.current?.startLoad() } catch { /* noop */ }
      video.pause()
      console.warn(`[rebuffer] buffer dry — holding until ${goal}s buffered ahead`)

      let waited = 0
      rebufferTimerRef.current = setInterval(() => {
        waited += 250
        const ahead = bufferAhead()
        const remaining = (video.duration || 0) - video.currentTime
        const nearEnd = remaining > 0 && ahead >= remaining - 0.5
        // Resume when the cushion is built, the rest of the title is buffered, or we've
        // waited long enough that holding further is pointless (let hls.js nudge/recover).
        if (ahead >= goal || nearEnd || waited >= 30000) {
          console.warn(`[rebuffer] resuming with ${ahead.toFixed(1)}s buffered (waited ${(waited / 1000).toFixed(1)}s)`)
          endRebuffer()
        }
      }, 250)
    }
    startRebufferRef.current = startRebuffer

    const onPlay = () => setIsPlaying(true)
    // Skip the "paused" UI while we're auto-rebuffering — the intent is still to play, and
    // the buffering overlay communicates the wait.
    const onPause = () => { if (rebufferingRef.current) return; setIsPlaying(false); clearBuffering() }
    // First frame is actually rendering — drop the loading overlays, mark that playback has
    // begun (so stalls may now trigger a rebuffer), and reset the network-error streak.
    const onPlaying = () => {
      setIsPlaying(true); setInitialLoading(false); clearBuffering()
      hasPlayedRef.current = true
      networkErrorCountRef.current = 0
    }
    const onCanPlay = () => clearBuffering()
    const onWaiting = () => { showBufferingSoon(); startRebuffer() }
    const onSeeking = () => showBufferingSoon()
    const onStalled = () => { showBufferingSoon(); startRebuffer() }
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      }

      // Decay the rebuffer goal back toward the base once the source has proven it can
      // play smoothly for a while, so a single rough patch doesn't keep us over-buffering.
      if (
        !rebufferingRef.current && rebufferGoalRef.current > 8 &&
        lastResumeWallRef.current > 0 && Date.now() - lastResumeWallRef.current > 60000
      ) {
        rebufferGoalRef.current = 8
      }

      if (nextEpisode && video.duration > 0 && video.duration - video.currentTime < 30) {
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
      cancelRebuffer()
    }
  }, [nextEpisode, activeStreamUrl])

  // Heartbeat every 10s
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      if (!videoRef.current) return
      const dur = Math.floor(videoRef.current.duration || 0)
      if (dur <= 0) return // Skip heartbeat until video duration metadata is loaded and positive
      playbackApi.heartbeat(
        {
          contentId: content.id,
          episodeId: episode?.id,
          sessionId: session.sessionId,
          positionSeconds: Math.floor(videoRef.current.currentTime),
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
      const dur = video ? Math.floor(video.duration || 0) : Math.floor(durationRef.current)
      
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (!video) return
      resetControlsTimeout()
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); cancelRebufferRef.current(); isPlaying ? video.pause() : video.play(); break
        case 'ArrowLeft': video.currentTime = Math.max(0, video.currentTime - 10); break
        case 'ArrowRight': video.currentTime = Math.min(video.duration, video.currentTime + 10); break
        case 'ArrowUp': video.volume = Math.min(1, video.volume + 0.1); break
        case 'ArrowDown': video.volume = Math.max(0, video.volume - 0.1); break
        case 'm': video.muted = !video.muted; break
        case 'f': handleFullscreen(); break
        case 'Escape': onClose(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPlaying, resetControlsTimeout, onClose])

  const handlePlayPause = () => {
    const video = videoRef.current
    if (!video) return
    // An explicit play/pause always wins over an in-progress auto-rebuffer.
    cancelRebufferRef.current()
    isPlaying ? video.pause() : video.play()
  }
  const handleMute = () => { if (videoRef.current) videoRef.current.muted = !isMuted }
  const handleVolumeChange = (v: number) => {
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0 }
  }
  const handleSeek = (t: number) => { if (videoRef.current) videoRef.current.currentTime = t }
  const handleLevelChange = (l: number) => { if (hlsRef.current) hlsRef.current.currentLevel = l; setCurrentLevel(l) }
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

  // HLS error state
  if (hlsError) {
    return (
      <div className={`${embedded ? 'absolute' : 'fixed'} inset-0 bg-black z-50 flex items-center justify-center`}>
        <div className="text-center max-w-md px-6">
          <p className="text-white/50 text-4xl mb-4">⚠</p>
          <p className="text-white font-semibold mb-2">Stream Error</p>
          <p className="text-white/60 text-sm mb-6">{hlsError}</p>
          <button
            onClick={onClose}
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
          proxyPort={activeStreamUrl.match(/^http:\/\/localhost:(\d+)\//)?.[1] || ''}
          currentSubtitle={currentSubtitle}
          subtitleOffset={subtitleOffset}
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
          duration={duration}
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
          onSubtitleChange={handleSubtitleChange}
          onSubtitleSizeChange={setSubtitleSize}
          onFullscreen={handleFullscreen}
          introEndSecs={episode?.introEndSecs ?? content.introEndSecs ?? null}
          creditsStartSecs={episode?.creditsStartSecs ?? content.creditsStartSecs ?? null}
          sources={sources}
          availableSourceIds={allStreams.map((s) => s.providerId)}
          activeSourceId={activeSourceId}
          onSourceChange={handleSourceChange}
          switchingSource={switchingSource}
          nextEpisode={nextEpisode}
          onNextEpisode={(ep) => { setShowNextEpisode(false); onNextEpisode?.(ep) }}
          onPip={onPip}
        />
      </div>
      )}
    </div>
  )
}
