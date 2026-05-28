import { useRef, useState, useEffect, useCallback, memo } from 'react'
import Hls from 'hls.js'
import type { ContentDetail, Episode } from '../../api/catalog'
import type { PlaybackSession } from '../../api/playback'
import { playbackApi } from '../../api/playback'
import { providersApi } from '../../api/providers'
import { PlayerControls } from './PlayerControls'
import { NextEpisodeOverlay } from './NextEpisodeOverlay'

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
}

// Lazy-load: render a <track> element ONLY for the currently selected external sub.
// Rendering every external sub eagerly caused the browser to fetch all of them in
// parallel, which triggered HTTP 429 (rate-limit) responses from opensubtitles.
const SubtitleTracks = memo(({ externalSubs, proxyPort, currentSubtitle }: SubtitleTracksProps) => {
  if (!proxyPort) return null
  if (currentSubtitle < 1000) return null
  const selected = externalSubs.find((s) => s.id === currentSubtitle)
  if (!selected) return null

  const cleanUrl = selected.url.replace(/^https?:\/\//, '')
  const proxiedUrl = `http://localhost:${proxyPort}/proxy/${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}format=vtt`

  return (
    <track
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
  onClose, onNextEpisode, nextEpisode,
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
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [showControls, setShowControls] = useState(true)
  const [showNextEpisode, setShowNextEpisode] = useState(false)
  const [hlsError, setHlsError] = useState<string | null>(null)

  const durationRef = useRef(duration)
  durationRef.current = duration
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  // Reset local state on external prop changes (e.g. initial load)
  useEffect(() => {
    setActiveStreamUrl(session.manifestUrl)
    setActiveHeaders(streamHeaders)
    setActiveSourceId(initialProviderId || null)
    setResumeAtSeconds(initialResumeAt ?? 0)
    setSwitchingError(null)
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

  const handleSourceChange = async (providerId: string) => {
    if (providerId === activeSourceId) return

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
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 180 * 1024 * 1024,
        startPosition: resumeAtSeconds && resumeAtSeconds > 0 ? resumeAtSeconds : -1,
        startLevel: -1,
        abrEwmaFastLive: 3.0,
        abrEwmaSlowLive: 9.0,
        abrEwmaFastVoD: 3.0,
        abrEwmaSlowVoD: 9.0,
        // Retry settings for unreliable provider streams
        manifestLoadingMaxRetry: 5,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 5,
        fragLoadingMaxRetry: 5,
        fragLoadingTimeOut: 20000,
        levelLoadingTimeOut: 20000,
      })

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

        // Prioritize starting at the highest resolution (1080p minimum priority) immediately
        if (data.levels.length > 0) {
          let highestIdx = 0
          let maxRes = 0
          for (let i = 0; i < data.levels.length; i++) {
            const stdH = getStandardHeight(data.levels[i].width || 0, data.levels[i].height || 0)
            if (stdH > maxRes) {
              maxRes = stdH
              highestIdx = i
            }
          }
          hls.nextLevel = highestIdx
          setCurrentLevel(-1) // Start in AUTO mode to preserve native adaptive quality scaling
        }
      })

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        setInternalSubs(data.subtitleTracks.map((t) => ({ id: t.id, name: getCleanSubtitleName(t.name, t.lang ?? ''), lang: t.lang ?? '' })))
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
        if (!data.fatal) return
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Try to recover network errors
            hls.startLoad()
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

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
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
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('volumechange', onVolumeChange)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('volumechange', onVolumeChange)
    }
  }, [nextEpisode, activeStreamUrl])

  // Heartbeat every 10s
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      if (!videoRef.current) return
      playbackApi.heartbeat(
        {
          contentId: content.id,
          episodeId: episode?.id,
          sessionId: session.sessionId,
          positionSeconds: Math.floor(videoRef.current.currentTime),
          durationSeconds: Math.floor(videoRef.current.duration || 0),
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
        case ' ': case 'k': e.preventDefault(); isPlaying ? video.pause() : video.play(); break
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
  const handleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen()
    else document.exitFullscreen()
  }

  // HLS error state
  if (hlsError) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
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
      className="fixed inset-0 bg-black z-50"
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className={`absolute top-4 right-4 z-30 text-white/70 hover:text-white transition-opacity duration-300 flex items-center justify-center ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Title */}
      <div className={`absolute top-4 left-4 z-30 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-white font-semibold">{content.title}</p>
        {episode && (
          <p className="text-white/60 text-sm">
            S{content.seasons.find((s) => s.episodes.some((e) => e.id === episode.id))?.seasonNumber}
            E{episode.episodeNumber} — {episode.title}
          </p>
        )}
      </div>

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
        />
      </video>

      {showNextEpisode && nextEpisode && (
        <NextEpisodeOverlay
          nextEpisode={nextEpisode}
          onPlay={() => { setShowNextEpisode(false); onNextEpisode?.(nextEpisode) }}
          onDismiss={() => setShowNextEpisode(false)}
        />
      )}

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
        />
      </div>
    </div>
  )
}
