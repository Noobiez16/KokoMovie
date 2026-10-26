import { useRef, useState, useEffect, useCallback, useMemo, memo } from 'react'
import Hls from 'hls.js'
import { useTranslation } from 'react-i18next'
import { PlaybackRecoveryDeadline, getPlaybackRecoveryPatch } from './playback-recovery'
import type { ContentDetail, Episode } from '../../api/catalog'
import type { PlaybackSession } from '../../api/playback'
import { playbackApi } from '../../api/playback'
import { providersApi, torrentApi } from '../../api/providers'
import { PlayerControls } from './PlayerControls'
import { SourceQualityNotice } from './SourceQualityNotice'
import { NextEpisodeOverlay } from './NextEpisodeOverlay'
import { autoSyncSubtitles, type SubCue } from '../../lib/subtitleAutoSync'
import { resolveSubtitleTrackUrl } from '../../../main/download-offline-policy'
import { usePlayerStore } from '../../store/player'
import { rankSourceStatuses } from '../../../main/providers/source-discovery'
import { selectAutomaticFallback } from '../../../main/providers/source-quality'
import { createMediaListenerScope } from '../../lib/media-listener-scope'
import { getStandardHeight } from '../../lib/video-quality'
import { withPlaybackDeadline, PlaybackProgressDeadline, PROVIDER_SWITCH_TIMEOUT_MS, TORRENT_SWITCH_TIMEOUT_MS, STARTUP_IDLE_TIMEOUT_MS, STARTUP_MAX_TIMEOUT_MS, TORRENT_SEEK_TIMEOUT_MS } from '../../lib/playback-limits'

interface CachedStream {
  providerId: string
  providerName: string
  streams: Array<{ url: string; quality: string; qualityInfo?: StreamQuality; headers?: Record<string, string>; audioLangs?: string[] }>
}

interface Props {
  content: ContentDetail
  episode: Episode | null
  session: PlaybackSession
  streamHeaders?: Record<string, string>
  initialProviderId?: string
  allStreams?: CachedStream[]
  sourceStatuses?: ProviderSourceStatus[]
  profileId: string
  resumeAtSeconds?: number
  defaultSubtitleLanguage?: string | null
  offlineSubtitles?: Array<{ id: number; name: string; lang: string; url: string }>
  onClose: () => void
  onNextEpisode?: (ep: Episode) => void
  nextEpisode?: Episode | null
  autoplayNextEpisode?: boolean
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
const PREFERRED_AUDIO_LANGS = ['en', 'es', 'fr', 'ru', 'it', 'pt', 'de', 'ja', 'ko', 'hi', 'zh', 'ar']

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
  proxyCapability: string
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
const SubtitleTracks = memo(({ externalSubs, proxyPort, proxyCapability, currentSubtitle, subtitleOffset, timelineOffset }: SubtitleTracksProps) => {
  const trackRef = useRef<HTMLTrackElement>(null)
  // Pristine cue times captured on first load, so repeated offset changes always
  // shift from the original timing (never compound).
  const originalsRef = useRef<Array<{ start: number; end: number }> | null>(null)

  const selected = currentSubtitle >= 1000 ? externalSubs.find((subtitle) => subtitle.id === currentSubtitle) : undefined
  const localUrl = selected?.url.startsWith('offline:') ?? false
  const proxiedUrl = selected ? resolveSubtitleTrackUrl(selected.url, proxyPort, proxyCapability) : ''
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

  if (!selected || (!localUrl && !proxyPort)) return null

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
  content, episode, session, streamHeaders, initialProviderId, allStreams = [], sourceStatuses = [], profileId, resumeAtSeconds: initialResumeAt,
  defaultSubtitleLanguage, offlineSubtitles = [], onClose, onNextEpisode, nextEpisode, autoplayNextEpisode = true, embedded = false, onPip,
}: Props) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controlsPinnedRef = useRef(false)
  const switchGenRef = useRef(0)
  const pendingSwitchRef = useRef<AbortController | null>(null)
  const switchRollbackRef = useRef<(() => void) | null>(null)
  const fragmentProgressRef = useRef<(() => number) | null>(null)
  const playVideoRef = useRef<(() => void) | null>(null)
  const sourceSuspendedRef = useRef(false)
  const [sourceReloadToken, setSourceReloadToken] = useState(0)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  const [activeStreamUrl, setActiveStreamUrl] = useState(session.manifestUrl)
  const [activeHeaders, setActiveHeaders] = useState<Record<string, string> | undefined>(streamHeaders)
  const [activeSourceId, setActiveSourceId] = useState<string | null>(initialProviderId || null)
  const [resumeAtSeconds, setResumeAtSeconds] = useState(initialResumeAt ?? 0)

  const [sources, setSources] = useState<Array<{ id: string; name: string; enabled: boolean }>>([])
  const [switchingSource, setSwitchingSource] = useState(false)
  const [switchingError, setSwitchingError] = useState<string | null>(null)
  const [awaitingFallback, setAwaitingFallback] = useState(false)
  const playbackRecoveryDeadlineRef = useRef<PlaybackRecoveryDeadline | null>(null)
  if (!playbackRecoveryDeadlineRef.current) {
    playbackRecoveryDeadlineRef.current = new PlaybackRecoveryDeadline()
  }

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
  // A torrent seek is a LEGITIMATE long operation, not a dead source: the stream server downloads a
  // ~66-second forward window (up to 90s of grace on a slow swarm) before ffmpeg emits its first
  // byte. The generic provider watchdogs judge on elapsed time / buffer progress and would call
  // that a failure after 20–25s, racing an in-flight request into fallback and error handling. This
  // flag marks the window between the reload and the first byte (or a real media error).
  const [torrentSeeking, setTorrentSeeking] = useState(false)
  const torrentSeekingRef = useRef(false)
  torrentSeekingRef.current = torrentSeeking
  // HLS proxy port for external subtitle fetches/tracks — NOT the torrent server's port.
  const [hlsProxyPort, setHlsProxyPort] = useState('')
  const [hlsProxyCapability, setHlsProxyCapability] = useState('')
  const [buffered, setBuffered] = useState(0)
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [levels, setLevels] = useState<Array<{ height: number; bitrate: number }>>([])
  const [decodedDimensions, setDecodedDimensions] = useState<{ width: number; height: number } | null>(null)
  // HLS alternate audio renditions. id maps directly to hls.js's audioTrack index.
  // -1 = the stream's default/original audio (also used when a manifest has a single track).
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; name: string; lang: string }>>([])
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1)
  const [internalSubs, setInternalSubs] = useState<Array<{ id: number; name: string; lang: string }>>([])
  const [externalSubs, setExternalSubs] = useState<Array<{ id: number; name: string; lang: string; url: string }>>([])
  const externalSubsRef = useRef<Array<{ id: number; name: string; lang: string; url: string }>>([])
  externalSubsRef.current = externalSubs

  // Internal HLS subtitles take priority because they are timed to the active stream.
  // Keep external variants only for languages not present internally, then sort the final list
  // deterministically so every variant of a language stays together. The saved preferred
  // language leads the list; remaining languages are alphabetical, with internal tracks first.
  const subtitleTracks = (() => {
    const preferredLang = normalizeLang(defaultSubtitleLanguage ?? "")
    const internalLangs = new Set(internalSubs.map((track) => normalizeLang(track.lang)))
    const combined = [
      ...internalSubs,
      ...externalSubs
        .filter((track) => !internalLangs.has(normalizeLang(track.lang)))
        .map((track) => ({ id: track.id, name: track.name, lang: track.lang })),
    ]

    return combined.sort((a, b) => {
      const aLang = normalizeLang(a.lang)
      const bLang = normalizeLang(b.lang)
      if (preferredLang) {
        const preferredOrder = Number(bLang === preferredLang) - Number(aLang === preferredLang)
        if (preferredOrder !== 0) return preferredOrder
      }
      const aLabel = LANGUAGE_MAP[aLang] ?? a.name
      const bLabel = LANGUAGE_MAP[bLang] ?? b.name
      const languageOrder = aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" })
      if (languageOrder !== 0) return languageOrder
      const sourceOrder = Number(a.id >= 1000) - Number(b.id >= 1000)
      if (sourceOrder !== 0) return sourceOrder
      const nameOrder = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      return nameOrder !== 0 ? nameOrder : a.id - b.id
    })
  })()
  const [currentSubtitle, setCurrentSubtitle] = useState(-1)
  const subtitlePreferenceKeyRef = useRef('')

  useEffect(() => {
    const preferredLang = normalizeLang(defaultSubtitleLanguage ?? '')
    const preferenceKey = [content.id, episode?.id ?? '', activeStreamUrl, preferredLang].join(':')
    if (!preferredLang || subtitlePreferenceKeyRef.current === preferenceKey) return
    const preferred = subtitleTracks.find((track) => normalizeLang(track.lang) === preferredLang)
    if (!preferred) return
    subtitlePreferenceKeyRef.current = preferenceKey
    setCurrentSubtitle(preferred.id)
    const hls = hlsRef.current
    if (hls) {
      const internal = preferred.id >= 0 && preferred.id < 1000
      hls.subtitleDisplay = internal
      hls.subtitleTrack = internal ? preferred.id : -1
    }
  }, [defaultSubtitleLanguage, content.id, episode?.id, activeStreamUrl, subtitleTracks])
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
    switchGenRef.current += 1
    pendingSwitchRef.current?.abort()
    pendingSwitchRef.current = null
    switchRollbackRef.current = null
    setSwitchingSource(false)
    setAwaitingFallback(false)
    setAutoplayBlocked(false)
    sourceSuspendedRef.current = false
    torrentStreamRef.current = null
    setOverrideDuration(0)
    setTorrentTimelineOffset(0)
    setTorrentSeeking(false)
    setHlsError(null)
    playbackRecoveryDeadlineRef.current?.cancel()
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
    return () => {
      switchGenRef.current += 1
      pendingSwitchRef.current?.abort()
      pendingSwitchRef.current = null
      switchRollbackRef.current = null
      void providersApi.cancelRequest?.()
    }
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
  const cancelSourceSwitch = useCallback(() => {
    switchGenRef.current += 1
    pendingSwitchRef.current?.abort()
    pendingSwitchRef.current = null
    void providersApi.cancelRequest?.()
    const rollback = switchRollbackRef.current
    switchRollbackRef.current = null
    rollback?.()
    playbackRecoveryDeadlineRef.current?.cancel()
    setSwitchingSource(false)
    setAwaitingFallback(false)
    setSwitchingError(null)
    if (!rollback) setHlsError(t('player.switchCancelled'))
  }, [t])

  const beginSourceSwitch = () => {
    pendingSwitchRef.current?.abort()
    switchRollbackRef.current?.()
    const controller = new AbortController()
    pendingSwitchRef.current = controller
    const generation = ++switchGenRef.current
    const video = videoRef.current
    const wasPlaying = !!video && !video.paused
    const previouslyPinned = userPinnedSourceRef.current
    const position = hlsError || sourceSuspendedRef.current
      ? currentTimeRef.current
      : (video?.currentTime ?? 0) + (torrentStreamRef.current?.transcoded ? torrentTimelineOffsetRef.current : 0)
    try { video?.pause(); hlsRef.current?.stopLoad?.() } catch { /* already stopped */ }
    const rollback = () => {
      userPinnedSourceRef.current = previouslyPinned
      if (video?.isConnected) {
        try { hlsRef.current?.startLoad() } catch { /* native source */ }
        if (wasPlaying) void video.play().catch(() => {})
      }
    }
    const canRollback = !!video && !hlsError && !sourceSuspendedRef.current
    switchRollbackRef.current = canRollback ? rollback : null
    setSwitchingSource(true)
    setAwaitingFallback(false)
    setSwitchingError(null)
    playbackRecoveryDeadlineRef.current?.cancel()
    let committed = false
    return {
      signal: controller.signal, position,
      current: () => generation === switchGenRef.current && !controller.signal.aborted,
      commit: () => { committed = true },
      finish: () => {
        if (generation !== switchGenRef.current) return
        if (!committed && canRollback) rollback()
        pendingSwitchRef.current = null
        switchRollbackRef.current = null
        setSwitchingSource(false)
        setAwaitingFallback(false)
      },
    }
  }

  // A torrent stream is a progressive MP4 (remuxed or direct), not an HLS manifest: it carries the
  // ONE audio stream ffmpeg selected and no rendition metadata, so hls.js never fires
  // AUDIO_TRACKS_UPDATED for it and the Audio menu would keep showing the previous source's tracks.
  // Publish the dub we asked the remux for as the stream's sole track so the menu reads "Spanish"
  // (or French / Portuguese / German …) — and never advertise renditions the MP4 doesn't contain.
  const publishTorrentAudioTrack = (lang: string) => {
    if (!lang) { setAudioTracks([]); setCurrentAudioTrack(-1); return }
    setAudioTracks([{ id: -1, name: getCleanAudioName('', lang), lang }])
    setCurrentAudioTrack(-1)
    currentAudioLangRef.current = lang
  }

  // Drop the outgoing source's audio renditions as a new source is COMMITTED. A torrent has already
  // published its single dub (above), so this only clears for non-torrent sources, whose real list
  // arrives with hls.js's AUDIO_TRACKS_UPDATED. Deliberately not done on entry: a switch that is
  // cancelled or fails must leave the still-playing source's Audio menu intact.
  const resetAudioForNonTorrentSource = () => {
    if (torrentStreamRef.current) return
    setAudioTracks([])
    setCurrentAudioTrack(-1)
  }

  const resolveCandidate = async (source: CachedStream, signal: AbortSignal, language = '', timeoutMs = TORRENT_SWITCH_TIMEOUT_MS) => {
    const stream = source.streams[0]
    if (!stream) throw new Error(t('player.sourceUnavailable'))
    if (!stream.url.startsWith('magnet:')) return { stream, url: stream.url, torrent: null, audioLang: '', transcoded: false }
    const declared = stream.audioLangs?.length === 1 ? normalizeLang(stream.audioLangs[0]!) : ''
    const wanted = language || declared || currentAudioLangRef.current
    const resolved = await withPlaybackDeadline(Promise.resolve().then(() => torrentApi.resolve(stream.url, wanted)), timeoutMs, signal)
    if (!resolved?.url) throw new Error(resolved?.error || t('player.sourceUnavailable'))
    if (language && resolved.audioLang && resolved.audioLang !== language) throw new Error(t('player.dubUnavailable'))
    // Keep the capability query when generating seek requests.
    return { stream, url: resolved.url, torrent: { baseUrl: resolved.url, transcoded: !!resolved.transcoded }, audioLang: resolved.audioLang || wanted, transcoded: !!resolved.transcoded }
  }

  const commitCandidate = (providerId: string, result: Awaited<ReturnType<typeof resolveCandidate>>, position: number, pin: boolean) => {
    torrentStreamRef.current = result.torrent
    setOverrideDuration(result.transcoded && knownRuntimeSecs > 0 ? knownRuntimeSecs : 0)
    setTorrentSeeking(false)
    setTorrentTimelineOffset(0)
    if (result.torrent) publishTorrentAudioTrack(result.audioLang)
    else resetAudioForNonTorrentSource()
    if (pin) userPinnedSourceRef.current = true
    setResumeAtSeconds(result.transcoded ? 0 : position)
    setActiveStreamUrl(result.url)
    setActiveHeaders(result.stream.headers)
    setActiveSourceId(providerId)
    sourceSuspendedRef.current = false
    setHlsError(null)
    setAutoplayBlocked(false)
    setInitialLoading(true)
    // Explicit retry may resolve to the same URL. It still needs a fresh media lifecycle.
    setSourceReloadToken(value => value + 1)
  }

  const handleSourceChange = async (providerId: string, isAuto = false, forceRefresh = false) => {
    if (providerId === activeSourceId && !forceRefresh) return false
    const wasRecovering = !!hlsError || sourceSuspendedRef.current
    const cached = allStreams.find(source => source.providerId === providerId)
    const selectedQuality = cached?.streams[0]?.qualityInfo
    if ((selectedQuality?.releaseType === 'cam' || selectedQuality?.releaseType === 'telesync') && !window.confirm(t('player.camWarning'))) {
      if (wasRecovering) failPlayback(t('player.switchCancelled'))
      return false
    }
    const attempt = beginSourceSwitch()
    try {
      let source = cached
      if (!source?.streams.length || (forceRefresh && !providerId.startsWith('p2p-'))) {
        const req = getStreamRequest()
        if (!req) throw new Error(t('player.missingMetadata'))
        const result = await withPlaybackDeadline(Promise.resolve().then(() => providersApi.getStream(providerId, req)), PROVIDER_SWITCH_TIMEOUT_MS, attempt.signal)
        if (!attempt.current()) return false
        const winningStream = result?.streams?.[0]
        if (!winningStream) throw new Error(result?.error || t('player.sourceUnavailable'))
        const freshReleaseType = winningStream.qualityInfo?.releaseType
        if ((freshReleaseType === 'cam' || freshReleaseType === 'telesync') && !window.confirm(t('player.camWarning'))) {
          if (wasRecovering) failPlayback(t('player.switchCancelled'))
          return false
        }
        source = { providerId: result.providerId, providerName: result.providerName, streams: result.streams }
        const currentRequest = usePlayerStore.getState().request
        if (currentRequest) {
          const statusBase = currentRequest.sourceStatuses ?? sourceStatuses
          const availableStatus: ProviderSourceStatus = { providerId, providerName: result.providerName, state: 'available', qualityInfo: winningStream.qualityInfo }
          const freshSourceStatuses = statusBase.some(status => status.providerId === providerId)
            ? statusBase.map(status => status.providerId === providerId ? availableStatus : status) : [...statusBase, availableStatus]
          usePlayerStore.getState().patchRequest({
            allStreams: [...(currentRequest.allStreams ?? []).filter(item => item.providerId !== providerId), source],
            sourceStatuses: rankSourceStatuses(freshSourceStatuses),
          })
        }
      }
      const resolved = await resolveCandidate(source!, attempt.signal)
      if (!attempt.current()) return false
      // Main already registered trusted source headers before publishing a result.
      // The non-blocking header effect remains available for legacy callers.
      commitCandidate(providerId, resolved, attempt.position, !isAuto)
      attempt.commit()
      return true
    } catch (error) {
      if (attempt.current()) {
        const message = error instanceof Error && error.message === 'PLAYBACK_TIMEOUT' ? t('player.switchTimedOut') : t('player.switchFailed')
        if (wasRecovering) failPlayback(message)
        else setSwitchingError(message)
      }
      return false
    } finally { attempt.finish() }
  }

  const failPlayback = (message: string) => {
    playbackRecoveryDeadlineRef.current?.cancel()
    try { hlsRef.current?.stopLoad?.(); videoRef.current?.pause() } catch { /* source already closed */ }
    setInitialLoading(false)
    setIsBuffering(false)
    setAwaitingFallback(false)
    setAutoplayBlocked(false)
    setHlsError(message)
  }

  // Automatically move to the next collected source when the current one can't play
  // (segments never start, buffering hangs, or fatal network errors). This is what
  // keeps playback reliable on flaky CDNs instead of spinning on "Loading video…".
  const autoFallback = (reason: string) => {
    if (switchingSource) return
    // A torrent seek is still downloading its forward window — never treat that as a dead source.
    if (torrentSeekingRef.current) {
      console.warn(`[auto-fallback] ${reason} — torrent seek in progress, waiting`)
      return
    }
    // A torrent is ALWAYS an explicit user choice (auto-fallback never selects one), and its
    // startup/seek costs are nothing like an embed's. Generic embed fallback must not handle it,
    // independently of the pin below — the pin is cleared on every new title, this is not.
    if (torrentStreamRef.current || activeSourceId?.startsWith('p2p-') || userPinnedSourceRef.current) {
      failPlayback(t('player.sourceNotResponding'))
      return
    }
    if (activeSourceId) triedSourcesRef.current.add(activeSourceId)
    // Auto-fallback only ever switches between EMBED sources (fast HLS). NEVER auto-switch into a
    // P2P torrent (`p2p-*`): they take up to ~25s of peer discovery and frequently have no peers,
    // so cycling into them is exactly the "keeps switching server source, loads forever, then
    // 'no peers found'" symptom. Torrent dubs are an explicit user choice only.
    const next = selectAutomaticFallback(allStreams, activeSourceId ?? null, triedSourcesRef.current)
    if (next) {
      playbackRecoveryDeadlineRef.current?.cancel()
      console.warn(`[auto-fallback] ${reason} — switching to ${next.providerName} (${next.providerId})`)
      networkErrorCountRef.current = 0
      setSwitchingError(null)
      const pending = handleSourceChange(next.providerId, true)
      const generation = switchGenRef.current
      void pending.then(changed => {
        if (changed === false && generation === switchGenRef.current) failPlayback(t('player.sourceNotResponding'))
      })
    } else {
      console.warn(`[auto-fallback] ${reason} — no untried sources left`)
      setInitialLoading(false)
      setHlsError(null)
      setAwaitingFallback(true)
      playbackRecoveryDeadlineRef.current?.start(() => {
        setAwaitingFallback(false)
        failPlayback(t('player.noPlayableSource'))
      }, 8000)
    }
  }
  autoFallbackRef.current = autoFallback

  // The initial winner can fail before the background provider race finishes collecting
  // alternatives. When late sources arrive, recover automatically instead of leaving the
  // terminal Stream Error visible and forcing the user to choose the same source manually.
  useEffect(() => {
    if (!awaitingFallback || switchingSource) return
    const hasUntriedEmbed = allStreams.some((source) =>
      source.providerId !== activeSourceId && !source.providerId.startsWith('p2p-')
        && !triedSourcesRef.current.has(source.providerId) && source.streams.length > 0,
    )
    if (hasUntriedEmbed) {
      setAwaitingFallback(false)
      setInitialLoading(true)
      autoFallbackRef.current('late working source collected')
    }
  }, [allStreams, awaitingFallback, switchingSource, activeSourceId])

  useEffect(() => () => playbackRecoveryDeadlineRef.current?.cancel(), [])

  // Watchdog: give up on a source only when it's genuinely dead — never when it's just slow.
  useEffect(() => {
    if (switchingSource) return
    // A torrent seek in flight is not a stalled source. The stream server is downloading the
    // forward window and has not written a byte yet by design; judging it on elapsed time or
    // buffer progress races a healthy request into fallback/error handling.
    if (torrentSeeking) return
    if (!initialLoading && !isBuffering) return

    // Initial startup has a no-progress deadline and an absolute first-frame cap.
    // Byte progress lets a large 4K fragment finish without granting endless retries.
    if (initialLoading) {
      const deadline = new PlaybackProgressDeadline(Date.now(), STARTUP_IDLE_TIMEOUT_MS, STARTUP_MAX_TIMEOUT_MS)
      const interval = setInterval(() => {
        const video = videoRef.current
        const end = video && video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0
        const bytes = fragmentProgressRef.current?.() ?? 0
        if (deadline.expired(Date.now(), Math.max(bytes, end * 1_000_000))) {
          clearInterval(interval)
          autoFallbackRef.current('initial-load timeout')
        }
      }, 1000)
      return () => clearInterval(interval)
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
  }, [initialLoading, isBuffering, switchingSource, torrentSeeking, activeStreamUrl, sourceReloadToken])

  useEffect(() => {
    if (!torrentSeeking) return
    const timer = setTimeout(() => {
      setTorrentSeeking(false)
      failPlayback(t('player.seekTimedOut'))
    }, TORRENT_SEEK_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [torrentSeeking, activeStreamUrl, t])

  // Resolve the HLS proxy port once per stream URL change. Torrent sources play from a
  // different local server, so never derive subtitle proxy port from activeStreamUrl alone.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const match = activeStreamUrl.match(/^http:\/\/localhost:(\d+)\/proxy\//)
      if (match) {
        if (!cancelled) {
          setHlsProxyPort(match[1]!)
          try {
            setHlsProxyCapability(new URL(activeStreamUrl).searchParams.get('kmc') ?? '')
          } catch {
            setHlsProxyCapability('')
          }
        }
        return
      }
      const proxyInfo = await window.electronAPI?.getProxyInfo?.()
      if (!cancelled && proxyInfo?.port) {
        setHlsProxyPort(String(proxyInfo.port))
        setHlsProxyCapability(proxyInfo.capability)
      }
    })()
    return () => { cancelled = true }
  }, [activeStreamUrl])

  // Fetch external subtitles on content or episode change
  useEffect(() => {
    let active = true
    setExternalSubs([])
    if (offlineSubtitles.length > 0) {
      setExternalSubs(offlineSubtitles)
      return () => { active = false }
    }

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

        if (!hlsProxyPort || !hlsProxyCapability) return

        const listUrl = `http://localhost:${hlsProxyPort}/proxy/opensubtitles-v3.strem.io/subtitles/${typePath}/${subQuery}.json?kmc=${encodeURIComponent(hlsProxyCapability)}`
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
  }, [content.id, content.imdbId, content.type, content.seasons, episode, activeStreamUrl, hlsProxyPort, hlsProxyCapability, offlineSubtitles])

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

  // A different source must obtain fresh frame geometry from its own metadata.
  useEffect(() => { setDecodedDimensions(null) }, [activeStreamUrl])

  const sourceFailureMessage = t('player.sourceNotResponding')
  // Init HLS or direct video
  useEffect(() => {
    const video = videoRef.current
    if (!video || hlsError || sourceSuspendedRef.current) return

    setHlsError(null)
    setAutoplayBlocked(false)
    fragmentProgressRef.current = null
    setInitialLoading(true)
    setLevels([])
    setCurrentLevel(-1)
    const manifestUrl = activeStreamUrl
    const sourceListeners = createMediaListenerScope(video)
    let disposed = false
    const attemptPlay = () => {
      void video.play().catch((error: unknown) => {
        if (disposed) return
        const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
        if (name === 'NotAllowedError') {
          setInitialLoading(false)
          setIsBuffering(false)
          setAutoplayBlocked(true)
          setShowControls(true)
        } else if (name !== 'AbortError') autoFallbackRef.current('media play request rejected')
      })
    }
    playVideoRef.current = attemptPlay
    const playWhenReady: EventListener = attemptPlay
    const handleDirectMetadata: EventListener = () => {
      if (resumeAtSeconds && resumeAtSeconds > 0 && !torrentStreamRef.current?.transcoded) {
        video.currentTime = resumeAtSeconds
      }
      attemptPlay()
    }
    const handleDirectError: EventListener = () => failPlayback(sourceFailureMessage)
    const handleFallbackError: EventListener = () => failPlayback(sourceFailureMessage)

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
      sourceListeners.listen('loadedmetadata', handleDirectMetadata, { once: true })
      sourceListeners.listen('error', handleDirectError, { once: true })
      return () => {
        disposed = true
        if (playVideoRef.current === attemptPlay) playVideoRef.current = null
        sourceListeners.clear()
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
        // Let hls.js own bounded retries; restarting startLoad on each error
        // resets recovery and can create a perpetual loading loop.
        manifestLoadPolicy: { default: {
          maxTimeToFirstByteMs: 6000, maxLoadTimeMs: 10000,
          timeoutRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 1000 },
          errorRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 1000 },
        } },
        playlistLoadPolicy: { default: {
          maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 15000,
          timeoutRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
          errorRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
        } },
        fragLoadPolicy: { default: {
          maxTimeToFirstByteMs: 10000, maxLoadTimeMs: 45000,
          timeoutRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
          errorRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
        } },
        keyLoadPolicy: { default: {
          maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 15000,
          timeoutRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
          errorRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
        } },
      })

      // Don't let hls.js auto-render an internal subtitle unless the user actually has
      // one selected — otherwise it stacks on top of a selected external track.
      hls.subtitleDisplay = currentSubtitleRef.current >= 0 && currentSubtitleRef.current < 1000

      hls.loadSource(manifestUrl)
      hls.attachMedia(video)
      // Audio and video fragments can load concurrently. Observing only the latest
      // audio request would falsely time out a large, actively downloading 4K frame.
      const progressStats = new Set<{ loaded: number }>()
      fragmentProgressRef.current = () => [...progressStats].reduce((bytes, stats) => bytes + Math.max(0, stats.loaded), 0)
      if (Hls.Events.FRAG_LOADING) hls.on(Hls.Events.FRAG_LOADING, (_event, data) => {
        progressStats.add(data.frag.stats)
        if (progressStats.size > 64) progressStats.delete(progressStats.values().next().value!)
      })

      // Play only after the browser signals it has enough data to start — avoids
      // bufferStalledError caused by calling play() before the first segment buffers.
      sourceListeners.listen('canplay', playWhenReady, { once: true })

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const mapped = data.levels.map((l) => ({
          height: getStandardHeight(l.width || 0, l.height || 0) ?? 0,
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
      // Leave its retries intact; the progress watchdog bounds a genuine dead end.
      // (An earlier "auto-rebuffer-to-goal" that PAUSED playback to build an 8–30s cushion
      // made playback feel constantly stuck and was removed — see DN-035/DN-042. ABR already
      // adapts quality to throughput; we never force the bitrate down on a stall.)
      let keyErrorCount = 0
      let mediaRecoveryCount = 0
      let lastMediaRecovery = -Infinity
      const recentErrors = new Map<string, number>()

      // Log ALL hls.js errors — non-fatal demux/parse errors are silently swallowed by
      // the recovery handler below and are usually what causes "duration shown, 0:00 stuck".
      hls.on(Hls.Events.ERROR, (_, data) => {
        const signature = `${data.type}:${data.details}:${data.response?.code ?? ''}`
        const lastLog = recentErrors.get(signature) ?? -Infinity
        if (data.fatal || Date.now() - lastLog >= 5000) {
          recentErrors.set(signature, Date.now())
          console.warn('[hls ERROR]', {
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          reason: (data as any).reason,
          response: data.response ? { code: data.response.code, text: data.response.text } : undefined,
          frag: data.frag ? { sn: (data.frag as any).sn, url: data.frag.url?.slice(0, 140) } : undefined,
        })
        }
        if (!data.fatal) {
          if (
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
            // Fatal means the configured retries are exhausted. Do not restart them.
            autoFallbackRef.current('fatal network error')
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            if (video.error && mediaRecoveryCount < 2 && Date.now() - lastMediaRecovery >= 5000) {
              mediaRecoveryCount++
              lastMediaRecovery = Date.now()
              hls.recoverMediaError()
            } else autoFallbackRef.current('unrecoverable media error')
            break
          default:
            // hls.js can't handle this URL — try native <video> as a last resort
            // (covers cases where the URL is actually a direct video file or non-standard HLS)
            hls.destroy()
            hlsRef.current = null
            video.src = manifestUrl
            attemptPlay()
            sourceListeners.listen('error', handleFallbackError, { once: true })
            break
        }
      })

      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifestUrl
      sourceListeners.listen('loadedmetadata', playWhenReady)
      sourceListeners.listen('error', handleDirectError)
    }

    return () => {
      disposed = true
      if (playVideoRef.current === attemptPlay) playVideoRef.current = null
      sourceListeners.clear()
      // Disable the internal subtitle before teardown so it can't linger in a
      // 'showing' state and double up with the next source's subtitles.
      try { if (hlsRef.current) hlsRef.current.subtitleTrack = -1 } catch { /* noop */ }
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [activeStreamUrl, resumeAtSeconds, content.id, episode?.id, profileId, session.sessionId, sourceReloadToken, hlsError, sourceFailureMessage])

  // Bind to the rendered video so recovery from an error panel also observes the new element.
  const updateDecodedDimensions = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return
    setDecodedDimensions({ width: video.videoWidth, height: video.videoHeight })
  }

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
      const recovery = getPlaybackRecoveryPatch('playing')
      playbackRecoveryDeadlineRef.current?.markPlaying()
      setIsPlaying(true)
      setAutoplayBlocked(false)
      setInitialLoading(recovery.initialLoading)
      setAwaitingFallback(recovery.awaitingFallback)
      setHlsError(recovery.hlsError)
      clearBuffering()
      setTorrentSeeking(false)
      networkErrorCountRef.current = 0
    }
    // A seeked remux has produced decodable data — the watchdogs can resume judging this source.
    const onCanPlay = () => { clearBuffering(); setTorrentSeeking(false) }
    // …and a real media failure ends the grace window too, so a 503 from an unfetchable seek
    // region can't leave the watchdogs disarmed for the rest of the session.
    const onMediaError = () => setTorrentSeeking(false)
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
      if (!video.paused && video.currentTime > 0) onPlaying()
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
    const onLoadedMetadata = () => {
      const actualDuration = isNaN(video.duration) ? 0 : video.duration
      setDuration(actualDuration)
      const looksLikeRestrictionPlaceholder = !torrentStreamRef.current && knownRuntimeSecs >= 20 * 60
        && actualDuration > 0 && actualDuration < 3 * 60
      if (looksLikeRestrictionPlaceholder) {
        video.pause()
        autoFallbackRef.current('restricted or placeholder video detected')
      }
    }
    const onVolumeChange = () => { setIsMuted(video.muted); setVolume(video.volume) }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onMediaError)
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
      video.removeEventListener('error', onMediaError)
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
  }, [nextEpisode, activeStreamUrl, knownRuntimeSecs, sourceReloadToken, hlsError])

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
    const mountedVideo = videoRef.current
    return () => {
      const video = mountedVideo
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
    if (controlsPinnedRef.current) return
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  const pinControls = useCallback(() => {
    controlsPinnedRef.current = true
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
  }, [])

  const resumeControlsAutoHide = useCallback(() => {
    controlsPinnedRef.current = false
    resetControlsTimeout()
  }, [resetControlsTimeout])

  useEffect(() => {
    resetControlsTimeout()
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current) }
  }, [resetControlsTimeout])

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
    if (isPlaying) video.pause()
    else playVideoRef.current?.()
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
      // Stand the generic watchdogs down until this request produces data or fails: the server may
      // legitimately hold it for up to 90s while it downloads the forward window (see the flag's
      // declaration). Cleared on canplay / playing / media error.
      setTorrentSeeking(true)
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
    const wasRecovering = !!hlsError || sourceSuspendedRef.current
    const norm = normalizeLang(lang)
    const candidates = allStreams.filter(source => source.providerId !== activeSourceId && (source.streams[0]?.audioLangs ?? []).map(normalizeLang).includes(norm))
      .sort((a, b) => {
        if (preferredSourceId && (a.providerId === preferredSourceId || b.providerId === preferredSourceId)) return a.providerId === preferredSourceId ? -1 : 1
        return Number(a.providerId.startsWith('p2p-')) - Number(b.providerId.startsWith('p2p-'))
      }).slice(0, 6)
    if (!candidates.length) return
    const attempt = beginSourceSwitch()
    const deadline = Date.now() + TORRENT_SWITCH_TIMEOUT_MS
    try {
      for (const source of candidates) {
        const quality = source.streams[0]?.qualityInfo
        if ((quality?.releaseType === 'cam' || quality?.releaseType === 'telesync') && !window.confirm(t('player.camWarning'))) continue
        if (!attempt.current()) return
        const remaining = deadline - Date.now()
        if (remaining <= 0) break
        try {
          const resolved = await resolveCandidate(source, attempt.signal, norm, Math.min(30_000, remaining))
          if (!attempt.current()) return
          currentAudioLangRef.current = norm
          commitCandidate(source.providerId, resolved, attempt.position, true)
          attempt.commit()
          return
        } catch { if (!attempt.current()) return }
      }
      if (attempt.current()) {
        if (wasRecovering) failPlayback(t('player.dubUnavailable'))
        else setSwitchingError(t('player.dubUnavailable'))
      }
    } finally { attempt.finish() }
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

  // Source switching is for ordinary embed/debrid mirrors. Built-in P2P releases are language
  // implementations, not servers: expose them only through the Audio menu so users choose the dub
  // they want and the verified-language retry path can select a live release on their behalf.
  const mergedSources = useMemo(() => {
    const ids = new Set(sources.map((s) => s.id))
    const seen = new Set<string>()
    const extra = allStreams
      .filter((s) => !s.providerId.startsWith('p2p-')
        && !ids.has(s.providerId) && !seen.has(s.providerId) && seen.add(s.providerId))
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
      sourceSuspendedRef.current = true
      setHlsError(null)
      setInitialLoading(false)
      setSwitchingError(null)
      setOpenSettingsSignal((n) => n + 1)
    }
    return (
      <div className={`${embedded ? 'absolute' : 'fixed'} inset-0 bg-black z-50 flex items-center justify-center`}>
        <div className="text-center max-w-md px-6">
          <p className="text-white/50 text-4xl mb-4">⚠</p>
          <p className="text-white font-semibold mb-2">{t('player.streamError')}</p>
          <p className="text-white/60 text-sm mb-6">{hlsError}</p>
          <button type="button" onClick={() => {
            if (activeSourceId) {
              sourceSuspendedRef.current = true
              setHlsError(null)
              setInitialLoading(false)
              void handleSourceChange(activeSourceId, false, true)
            } else {
              sourceSuspendedRef.current = false
              setHlsError(null); setInitialLoading(true); setSourceReloadToken(value => value + 1)
            }
          }} className="bg-km-accent text-white px-6 py-2.5 rounded-lg mr-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{t('common.retry')}</button>
          <button
            onClick={chooseAnotherSource}
            className="bg-white/10 border border-white/20 text-white px-6 py-2.5 rounded-lg hover:bg-white/20 transition-colors"
          >
            ← {t('player.chooseAnotherSource')}
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
          <p className="text-white/80 text-sm font-semibold">{t('player.loadingVideo')}</p>
          <p className="text-white/40 text-xs mt-1">{t('player.fetchingStream')}</p>
        </div>
      )}

      {/* Buffering / seek overlay — shown when playback stalls on the network
          (most visibly after seeking on a slow CDN) so the user knows it's working. */}
      {isBuffering && !initialLoading && !switchingSource && !hlsError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/55 px-8 py-6 backdrop-blur-sm">
            <div className="w-9 h-9 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin" />
            <p className="text-white/80 text-xs font-medium">{t('common.loading')}</p>
          </div>
        </div>
      )}

      {/* Switch Source Loading Overlay */}
      {(switchingSource || awaitingFallback) && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center pointer-events-auto">
          <div className="w-10 h-10 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mb-4" />
          <p className="text-white text-sm font-semibold mb-5">{awaitingFallback ? t('player.findingAnotherSource') : t('player.switchingSource')}</p>
          <button
            onClick={cancelSourceSwitch}
            className="px-5 py-2 text-xs font-semibold text-white/80 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 hover:text-white transition-all duration-200"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      {autoplayBlocked && !switchingSource && <button type="button" onClick={() => playVideoRef.current?.()}
        className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 text-white text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-km-accent">
        <span className="rounded-full bg-km-accent px-8 py-4">▶ {t('common.play')}</span>
      </button>}

      {/* Switch Source Error Banner */}
      {switchingError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-4 py-2.5 rounded-lg border border-red-400/20 shadow-2xl z-40 flex items-center gap-2 backdrop-blur-md">
          <span>⚠</span>
          <span>{switchingError}</span>
          <button
            onClick={() => setSwitchingError(null)}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="ml-2 hover:opacity-80 font-bold"
          >×</button>
        </div>
      )}

      {!embedded && !switchingSource && !switchingError && <SourceQualityNotice
        quality={sourceStatuses.find(source => source.providerId === activeSourceId)?.qualityInfo ?? allStreams.find(source => source.providerId === activeSourceId)?.streams[0]?.qualityInfo}
        mediaUrl={activeStreamUrl} movie={content.type === 'movie'}
      />}

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
        crossOrigin="anonymous"
        onLoadedMetadata={updateDecodedDimensions}
        onResize={updateDecodedDimensions}
        onEmptied={() => setDecodedDimensions(null)}
        onClick={handlePlayPause}
        disablePictureInPicture
      >
        <SubtitleTracks
          externalSubs={externalSubs}
          proxyPort={hlsProxyPort}
          proxyCapability={hlsProxyCapability}
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
          autoplayEnabled={autoplayNextEpisode}
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
          decodedHeight={decodedDimensions ? getStandardHeight(decodedDimensions.width, decodedDimensions.height) : null}
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
          availableSourceIds={allStreams.filter((s) => !s.providerId.startsWith('p2p-')).map((s) => s.providerId)}
          sourceStatuses={sourceStatuses}
          audioLangsBySource={Object.fromEntries(
            allStreams
              .filter((s) => !s.providerId.startsWith('p2p-'))
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
          onInteractionStart={pinControls}
          onInteractionEnd={resumeControlsAutoHide}
        />
      </div>
      )}
    </div>
  )
}
