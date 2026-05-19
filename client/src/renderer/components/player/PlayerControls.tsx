import { useState, useCallback } from 'react'
import type Hls from 'hls.js'

interface Props {
  hls: Hls | null
  isPlaying: boolean
  isMuted: boolean
  volume: number
  currentTime: number
  duration: number
  buffered: number
  currentLevel: number
  levels: Array<{ height: number; bitrate: number }>
  subtitleTracks: Array<{ id: number; name: string; lang: string }>
  currentSubtitle: number
  onPlayPause: () => void
  onMute: () => void
  onVolumeChange: (v: number) => void
  onSeek: (t: number) => void
  onLevelChange: (l: number) => void
  onSubtitleChange: (id: number) => void
  onFullscreen: () => void
  onPiP: () => void
  introEndSecs: number | null
  creditsStartSecs: number | null
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function PlayerControls({
  hls, isPlaying, isMuted, volume, currentTime, duration, buffered,
  currentLevel, levels, subtitleTracks, currentSubtitle,
  onPlayPause, onMute, onVolumeChange, onSeek, onLevelChange, onSubtitleChange,
  onFullscreen, onPiP, introEndSecs, creditsStartSecs,
}: Props) {
  const [showQuality, setShowQuality] = useState(false)
  const [showSubtitles, setShowSubtitles] = useState(false)

  const handleSeekClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    onSeek(pct * duration)
  }, [duration, onSeek])

  const showSkipIntro = introEndSecs !== null && currentTime < introEndSecs && currentTime > (introEndSecs - 90)
  const showSkipCredits = creditsStartSecs !== null && currentTime >= creditsStartSecs

  const progress = duration ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration ? (buffered / duration) * 100 : 0

  return (
    <>
      {/* Skip intro button */}
      {showSkipIntro && (
        <div className="absolute bottom-24 right-6 z-20">
          <button
            onClick={() => onSeek(introEndSecs!)}
            className="bg-white/20 border border-white/40 text-white font-medium px-5 py-2 rounded hover:bg-white/30 transition-colors backdrop-blur-sm"
          >
            Skip Intro ›
          </button>
        </div>
      )}

      {/* Skip credits button */}
      {showSkipCredits && (
        <div className="absolute bottom-24 right-6 z-20">
          <button
            onClick={() => { /* next episode handled by parent */ }}
            className="bg-km-accent text-black font-semibold px-5 py-2 rounded hover:bg-km-accent/90 transition-colors"
          >
            Skip Credits ›
          </button>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-3 pt-8">
        {/* Seek bar */}
        <div
          className="relative h-1 rounded-full bg-white/20 cursor-pointer mb-3 group/seek hover:h-1.5 transition-all"
          onClick={handleSeekClick}
        >
          <div className="absolute h-full bg-white/30 rounded-full" style={{ width: `${bufferedPct}%` }} />
          <div className="absolute h-full bg-km-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-km-accent rounded-full opacity-0 group-hover/seek:opacity-100 transition-opacity"
            style={{ left: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button onClick={onPlayPause} className="text-white hover:text-km-accent transition-colors w-8 text-center text-xl">
              {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 group/vol">
              <button onClick={onMute} className="text-white/70 hover:text-white transition-colors w-6 text-center">
                {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-0 group-hover/vol:w-20 transition-all duration-200 accent-km-accent"
              />
            </div>

            {/* Time */}
            <span className="text-white/60 text-sm tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Subtitles */}
            {subtitleTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => { setShowSubtitles(!showSubtitles); setShowQuality(false) }}
                  className={`text-sm px-2 py-0.5 rounded transition-colors ${currentSubtitle >= 0 ? 'text-km-accent' : 'text-white/60 hover:text-white'}`}
                >
                  CC
                </button>
                {showSubtitles && (
                  <div className="absolute bottom-8 right-0 bg-black/90 rounded border border-white/10 overflow-hidden min-w-32">
                    <button
                      onClick={() => { onSubtitleChange(-1); setShowSubtitles(false) }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 ${currentSubtitle < 0 ? 'text-km-accent' : 'text-white/70'}`}
                    >
                      Off
                    </button>
                    {subtitleTracks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { onSubtitleChange(t.id); setShowSubtitles(false) }}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 ${currentSubtitle === t.id ? 'text-km-accent' : 'text-white/70'}`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quality */}
            {hls && levels.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => { setShowQuality(!showQuality); setShowSubtitles(false) }}
                  className="text-white/60 hover:text-white text-sm px-2 py-0.5 rounded transition-colors"
                >
                  {currentLevel === -1 ? 'AUTO' : `${levels[currentLevel]?.height}p`}
                </button>
                {showQuality && (
                  <div className="absolute bottom-8 right-0 bg-black/90 rounded border border-white/10 overflow-hidden min-w-28">
                    <button
                      onClick={() => { onLevelChange(-1); setShowQuality(false) }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 ${currentLevel === -1 ? 'text-km-accent' : 'text-white/70'}`}
                    >
                      Auto
                    </button>
                    {levels.map((lvl, i) => (
                      <button
                        key={i}
                        onClick={() => { onLevelChange(i); setShowQuality(false) }}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 ${currentLevel === i ? 'text-km-accent' : 'text-white/70'}`}
                      >
                        {lvl.height}p
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PiP */}
            <button onClick={onPiP} className="text-white/60 hover:text-white transition-colors text-sm" title="Picture in Picture">
              ⧉
            </button>

            {/* Fullscreen */}
            <button onClick={onFullscreen} className="text-white/60 hover:text-white transition-colors" title="Fullscreen">
              ⛶
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
