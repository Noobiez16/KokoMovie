import { useState, useCallback, useMemo } from 'react'
import type Hls from 'hls.js'

// Premium player exposes only the meaningful tiers: AUTO, 720p, 1080p.
// Lower tiers (240/360/480/540p) are still picked by AUTO when bandwidth requires,
// but never as a manual choice — there's no reason to deliberately downgrade.
const VISIBLE_QUALITY_HEIGHTS = [720, 1080] as const

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
  subtitleSize: 'small' | 'medium' | 'large'
  onPlayPause: () => void
  onMute: () => void
  onVolumeChange: (v: number) => void
  onSeek: (t: number) => void
  onLevelChange: (l: number) => void
  onSubtitleChange: (id: number) => void
  onSubtitleSizeChange: (size: 'small' | 'medium' | 'large') => void
  onFullscreen: () => void
  introEndSecs: number | null
  creditsStartSecs: number | null
  sources?: Array<{ id: string; name: string; enabled: boolean }>
  availableSourceIds?: string[]
  activeSourceId?: string | null
  onSourceChange?: (id: string) => void
  switchingSource?: boolean
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
  currentLevel, levels, subtitleTracks, currentSubtitle, subtitleSize,
  onPlayPause, onMute, onVolumeChange, onSeek, onLevelChange, onSubtitleChange, onSubtitleSizeChange,
  onFullscreen, introEndSecs, creditsStartSecs,
  sources = [], availableSourceIds, activeSourceId = null, onSourceChange, switchingSource = false,
}: Props) {
  const [showQuality, setShowQuality] = useState(false)
  const [showSubtitles, setShowSubtitles] = useState(false)
  const [showSources, setShowSources] = useState(false)

  const handleSeekClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    onSeek(pct * duration)
  }, [duration, onSeek])

  // Map the allowed tiers to actual HLS level indices for this stream.
  // A tier is hidden if the stream doesn't have a level for it (e.g. a 720p-only source
  // won't show a "1080p" button).
  // Split sources into confirmed-available and unconfirmed (shut down for this content).
  // Available = provider returned a stream during the initial race (fast-switch).
  // Shut down = not in allStreams; may still work via fresh extraction.
  const { availableSources, shutDownSources } = useMemo(() => {
    if (!availableSourceIds) return { availableSources: sources, shutDownSources: [] }
    const avSet = new Set(availableSourceIds)
    return {
      availableSources: sources.filter((s) => avSet.has(s.id)),
      shutDownSources: sources.filter((s) => !avSet.has(s.id)),
    }
  }, [sources, availableSourceIds])

  const visibleLevels = useMemo(() => {
    return VISIBLE_QUALITY_HEIGHTS
      .map((height) => ({ height, idx: levels.findIndex((l) => l.height === height) }))
      .filter((l) => l.idx >= 0)
  }, [levels])

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
          <div className="absolute h-full bg-white/35 rounded-full" style={{ width: `${bufferedPct}%` }} />
          <div className="absolute h-full bg-km-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-km-accent rounded-full opacity-0 group-hover/seek:opacity-100 transition-opacity"
            style={{ left: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button onClick={onPlayPause} className="text-white hover:text-km-accent transition-colors flex items-center justify-center w-8 h-8">
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z" />
                </svg>
              )}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 group/vol">
              <button onClick={onMute} className="text-white/70 hover:text-km-accent transition-colors flex items-center justify-center w-6 h-6">
                {isMuted || volume === 0 ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : volume < 0.5 ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 transition-all duration-200 accent-km-accent cursor-pointer"
              />
            </div>

            {/* Time */}
            <span className="text-white/60 text-sm tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Subtitles — always visible so the affordance is consistent across every movie/series.
                When no tracks are found (rare), the menu shows a clear empty state instead of hiding. */}
            <div className="relative">
              <button
                onClick={() => { setShowSubtitles(!showSubtitles); setShowQuality(false); setShowSources(false) }}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all duration-200 flex items-center gap-1.5 ${
                  currentSubtitle >= 0
                    ? 'bg-violet-600/20 border-violet-500/40 text-violet-400 font-semibold shadow-lg shadow-violet-500/5'
                    : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <rect x="3" y="4" width="18" height="16" rx="2" ry="2"/>
                  <path d="M7 10h2v2H7zM11 10h6v2h-6zM7 14h6v2H7zM15 14h2v2h-2z"/>
                </svg>
                <span>
                  {currentSubtitle >= 0
                    ? subtitleTracks.find((t) => t.id === currentSubtitle)?.name || 'CC'
                    : 'CC'}
                </span>
              </button>
              {showSubtitles && (
                <div className="absolute bottom-12 right-0 bg-black/95 backdrop-blur-md rounded-lg border border-white/15 overflow-y-auto min-w-[200px] max-h-[250px] shadow-2xl z-50 py-1 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                  <button
                    onClick={() => { onSubtitleChange(-1); setShowSubtitles(false) }}
                    className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-colors hover:bg-white/10 ${
                      currentSubtitle < 0
                        ? 'text-violet-400 bg-violet-500/10 font-semibold'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    <span>Off</span>
                    {currentSubtitle < 0 && (
                      <span className="text-violet-400 text-[10px] font-bold">✓</span>
                    )}
                  </button>
                  {subtitleTracks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { onSubtitleChange(t.id); setShowSubtitles(false) }}
                      className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-colors hover:bg-white/10 ${
                        currentSubtitle === t.id
                          ? 'text-violet-400 bg-violet-500/10 font-semibold'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      <span className="truncate pr-2">{t.name}</span>
                      {currentSubtitle === t.id && (
                        <span className="text-violet-400 text-[10px] font-bold flex-shrink-0">✓</span>
                      )}
                    </button>
                  ))}
                  {subtitleTracks.length === 0 && (
                    <div className="px-4 py-3 text-[11px] text-white/40 italic text-center">
                      No subtitles found for this title
                    </div>
                  )}
                  {/* Subtitle size selector — only meaningful when a track is available */}
                  {subtitleTracks.length > 0 && (
                    <div className="border-t border-white/10 mt-1 pt-1 px-3 pb-1">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 font-semibold">Size</p>
                      <div className="flex items-center gap-1">
                        {(['small', 'medium', 'large'] as const).map((size) => (
                          <button
                            key={size}
                            onClick={() => onSubtitleSizeChange(size)}
                            className={`flex-1 text-[10px] py-1 rounded transition-all duration-150 ${
                              subtitleSize === size
                                ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40 font-semibold'
                                : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/80'
                            }`}
                          >
                            {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Source / Server Selection */}
            {sources.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSources(!showSources)
                    setShowSubtitles(false)
                    setShowQuality(false)
                  }}
                  disabled={switchingSource}
                  className="text-white/60 hover:text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-all duration-200 flex items-center gap-1.5 bg-white/5 hover:bg-white/10 uppercase tracking-wider font-semibold"
                  title="Switch Stream Source"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-violet-400">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" />
                    <line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                  <span className="max-w-[80px] truncate">{sources.find((s) => s.id === activeSourceId)?.name || 'Server'}</span>
                </button>
                {showSources && (
                  <div className="absolute bottom-12 right-0 bg-black/95 backdrop-blur-md rounded-lg border border-white/15 overflow-y-auto min-w-[180px] max-h-[45vh] shadow-2xl z-50 py-1 scrollbar-thin scrollbar-thumb-white/25 scrollbar-track-transparent">
                    <p className="px-3 py-1.5 text-[9px] font-bold text-white/40 uppercase tracking-wider border-b border-white/5 mb-1">Select Source</p>

                    {/* Available sources — confirmed stream extracted for this content */}
                    {availableSources.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { onSourceChange?.(s.id); setShowSources(false) }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors hover:bg-white/10 ${
                          activeSourceId === s.id
                            ? 'text-violet-400 bg-violet-500/10 font-semibold'
                            : 'text-white/80 hover:text-white'
                        }`}
                      >
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex-shrink-0">A</span>
                        <span className="flex-1 truncate">{s.name}</span>
                        {activeSourceId === s.id && (
                          <span className="text-violet-400 text-[10px] font-bold flex-shrink-0">✓</span>
                        )}
                      </button>
                    ))}

                    {/* Divider between available and shut-down sections */}
                    {shutDownSources.length > 0 && availableSources.length > 0 && (
                      <div className="border-t border-white/8 my-1" />
                    )}

                    {/* Shut-down sources — did not return a stream for this content */}
                    {shutDownSources.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { onSourceChange?.(s.id); setShowSources(false) }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors hover:bg-white/5 ${
                          activeSourceId === s.id
                            ? 'text-violet-400 bg-violet-500/10 font-semibold'
                            : 'text-white/35 hover:text-white/55'
                        }`}
                      >
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-400/60 border border-red-500/20 flex-shrink-0">S</span>
                        <span className="flex-1 truncate">{s.name}</span>
                        {activeSourceId === s.id && (
                          <span className="text-violet-400 text-[10px] font-bold flex-shrink-0">✓</span>
                        )}
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
                  onClick={() => { setShowQuality(!showQuality); setShowSubtitles(false); setShowSources(false) }}
                  className="text-white/60 hover:text-white text-sm px-2 py-0.5 rounded transition-colors"
                >
                  {currentLevel === -1 ? 'AUTO' : `${levels[currentLevel]?.height ?? ''}p`}
                </button>
                {showQuality && (
                  <div className="absolute bottom-10 right-0 bg-black/95 backdrop-blur-md rounded-lg border border-white/15 overflow-y-auto min-w-[120px] max-h-[45vh] shadow-2xl z-50 py-1 scrollbar-thin scrollbar-thumb-white/25 scrollbar-track-transparent">
                    <button
                      onClick={() => { onLevelChange(-1); setShowQuality(false) }}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors hover:bg-white/10 ${
                        currentLevel === -1
                          ? 'text-km-accent bg-white/5 font-semibold'
                          : 'text-white/70'
                      }`}
                    >
                      <span>Auto</span>
                      {currentLevel === -1 && (
                        <span className="text-km-accent text-xs font-bold">✓</span>
                      )}
                    </button>
                    {visibleLevels.map(({ height, idx }) => (
                      <button
                        key={height}
                        onClick={() => { onLevelChange(idx); setShowQuality(false) }}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors hover:bg-white/10 ${
                          currentLevel === idx
                            ? 'text-km-accent bg-white/5 font-semibold'
                            : 'text-white/70'
                        }`}
                      >
                        <span>{height}p</span>
                        {currentLevel === idx && (
                          <span className="text-km-accent text-xs font-bold">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}



            {/* Fullscreen */}
            <button onClick={onFullscreen} className="text-white/60 hover:text-km-accent transition-colors flex items-center justify-center" title="Fullscreen">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <polyline points="21 15 21 21 15 21" />
                <polyline points="3 9 3 3 9 3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
