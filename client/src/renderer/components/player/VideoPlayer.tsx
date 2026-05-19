import { useRef, useState, useEffect, useCallback } from 'react'
import Hls from 'hls.js'
import type { ContentDetail, Episode } from '../../api/catalog'
import type { PlaybackSession } from '../../api/playback'
import { playbackApi } from '../../api/playback'
import { providersApi } from '../../api/providers'
import { PlayerControls } from './PlayerControls'
import { NextEpisodeOverlay } from './NextEpisodeOverlay'

interface Props {
  content: ContentDetail
  episode: Episode | null
  session: PlaybackSession
  streamHeaders?: Record<string, string>
  profileId: string
  onClose: () => void
  onNextEpisode?: (ep: Episode) => void
  nextEpisode?: Episode | null
}

export function VideoPlayer({
  content, episode, session, streamHeaders, profileId,
  onClose, onNextEpisode, nextEpisode,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [levels, setLevels] = useState<Array<{ height: number; bitrate: number }>>([])
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ id: number; name: string; lang: string }>>([])
  const [currentSubtitle, setCurrentSubtitle] = useState(-1)
  const [showControls, setShowControls] = useState(true)
  const [showNextEpisode, setShowNextEpisode] = useState(false)
  const [hlsError, setHlsError] = useState<string | null>(null)

  const durationRef = useRef(duration)
  durationRef.current = duration
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  // Register stream headers with main process so HLS.js segment requests get correct headers
  useEffect(() => {
    if (streamHeaders && Object.keys(streamHeaders).length > 0) {
      providersApi.registerStreamHeaders(session.manifestUrl, streamHeaders).catch(() => {})
    }
  }, [session.manifestUrl, streamHeaders])

  // Init HLS
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    setHlsError(null)
    const manifestUrl = session.manifestUrl

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        startLevel: -1,
        abrEwmaFastLive: 3.0,
        abrEwmaSlowLive: 9.0,
        abrEwmaFastVoD: 3.0,
        abrEwmaSlowVoD: 9.0,
        // Retry settings for unreliable provider streams
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 3,
      })

      hls.loadSource(manifestUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLevels(data.levels.map((l) => ({ height: l.height, bitrate: l.bitrate })))
        video.play().catch(() => {})
      })

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        setSubtitleTracks(data.subtitleTracks.map((t) => ({ id: t.id, name: t.name, lang: t.lang ?? '' })))
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentLevel(data.level)
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

      // Fatal error handling with recovery
      hls.on(Hls.Events.ERROR, (_, data) => {
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
            // Unrecoverable — show error state
            hls.destroy()
            setHlsError('Stream failed to load. Try choosing a different source.')
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
  }, [session.manifestUrl])

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

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
    const onDurationChange = () => setDuration(video.duration || 0)
    const onVolumeChange = () => { setIsMuted(video.muted); setVolume(video.volume) }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('volumechange', onVolumeChange)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('volumechange', onVolumeChange)
    }
  }, [nextEpisode])

  // Heartbeat every 10s
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      if (!videoRef.current) return
      playbackApi.heartbeat(
        {
          contentId: content.id,
          episodeId: episode?.id,
          sessionId: session.sessionId,
          positionSeconds: videoRef.current.currentTime,
          durationSeconds: videoRef.current.duration || 0,
          quality: currentLevel === -1 ? 'auto' : `${levels[currentLevel]?.height}p`,
        },
        profileId
      ).catch(() => {})
    }, 10000)

    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
  }, [content.id, episode?.id, session.sessionId, profileId, currentLevel, levels])

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
  const handleSubtitleChange = (id: number) => { if (hlsRef.current) hlsRef.current.subtitleTrack = id; setCurrentSubtitle(id) }
  const handleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen()
    else document.exitFullscreen()
  }
  const handlePiP = async () => {
    const video = videoRef.current
    if (!video) return
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    else await video.requestPictureInPicture().catch(() => {})
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
        className={`absolute top-4 left-4 z-30 text-white/70 hover:text-white text-2xl transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        ✕
      </button>

      {/* Title */}
      <div className={`absolute top-4 left-14 z-30 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-white font-semibold">{content.title}</p>
        {episode && (
          <p className="text-white/60 text-sm">
            S{content.seasons.find((s) => s.episodes.some((e) => e.id === episode.id))?.seasonNumber}
            E{episode.episodeNumber} — {episode.title}
          </p>
        )}
      </div>

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
        onClick={handlePlayPause}
      />

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
          onPlayPause={handlePlayPause}
          onMute={handleMute}
          onVolumeChange={handleVolumeChange}
          onSeek={handleSeek}
          onLevelChange={handleLevelChange}
          onSubtitleChange={handleSubtitleChange}
          onFullscreen={handleFullscreen}
          onPiP={handlePiP}
          introEndSecs={episode?.introEndSecs ?? content.introEndSecs ?? null}
          creditsStartSecs={episode?.creditsStartSecs ?? content.creditsStartSecs ?? null}
        />
      </div>
    </div>
  )
}
