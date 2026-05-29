import { useState, useCallback, useMemo } from 'react'
import type Hls from 'hls.js'

// Premium player exposes only the meaningful tiers: AUTO, 720p, 1080p.
// Lower tiers (240/360/480/540p) are still picked by AUTO when bandwidth requires,
// but never as a manual choice — there's no reason to deliberately downgrade.
const VISIBLE_QUALITY_HEIGHTS = [720, 1080] as const

type MenuView = 'home' | 'source' | 'subtitles' | 'quality'

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
  subtitleOffset: number
  onPlayPause: () => void
  onMute: () => void
  onVolumeChange: (v: number) => void
  onSeek: (t: number) => void
  onLevelChange: (l: number) => void
  onSubtitleChange: (id: number) => void
  onSubtitleSizeChange: (size: 'small' | 'medium' | 'large') => void
  onSubtitleOffsetChange: (offset: number) => void
  onAutoSync?: () => void
  autoSyncState?: 'idle' | 'running' | 'done' | 'fail'
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

const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

export function PlayerControls({
  hls, isPlaying, isMuted, volume, currentTime, duration, buffered,
  currentLevel, levels, subtitleTracks, currentSubtitle, subtitleSize, subtitleOffset,
  onPlayPause, onMute, onVolumeChange, onSeek, onLevelChange, onSubtitleChange, onSubtitleSizeChange, onSubtitleOffsetChange,
  onAutoSync, autoSyncState = 'idle',
  onFullscreen, introEndSecs, creditsStartSecs,
  sources = [], availableSourceIds, activeSourceId = null, onSourceChange, switchingSource = false,
}: Props) {
  // One gear button opens a single settings panel. It uses a drill-down layout
  // (home list → category) like mainstream players, instead of dumping every option
  // on screen at once.
  const [showSettings, setShowSettings] = useState(false)
  const [menuView, setMenuView] = useState<MenuView>('home')

  const openSettings = useCallback(() => {
    setShowSettings((v) => {
      const next = !v
      if (next) setMenuView('home')
      return next
    })
  }, [])
  const closeSettings = useCallback(() => { setShowSettings(false); setMenuView('home') }, [])

  const handleSeekClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    onSeek(pct * duration)
  }, [duration, onSeek])

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

  // Map the allowed tiers to actual HLS level indices for this stream.
  const visibleLevels = useMemo(() => {
    return VISIBLE_QUALITY_HEIGHTS
      .map((height) => ({ height, idx: levels.findIndex((l) => l.height === height) }))
      .filter((l) => l.idx >= 0)
  }, [levels])

  const showSkipIntro = introEndSecs !== null && currentTime < introEndSecs && currentTime > (introEndSecs - 90)
  const showSkipCredits = creditsStartSecs !== null && currentTime >= creditsStartSecs

  const progress = duration ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration ? (buffered / duration) * 100 : 0

  const hasQuality = !!hls && levels.length > 0
  const hasSources = sources.length > 1
  const activeSubtitleName = currentSubtitle >= 0
    ? subtitleTracks.find((t) => t.id === currentSubtitle)?.name || 'On'
    : 'Off'
  const activeSourceName = sources.find((s) => s.id === activeSourceId)?.name || 'Server'
  const activeQualityName = currentLevel === -1 ? 'Auto' : `${levels[currentLevel]?.height ?? ''}p`

  // Reusable bits ----------------------------------------------------------------
  const BackHeader = ({ title }: { title: string }) => (
    <button
      onClick={() => setMenuView('home')}
      className="w-full flex items-center gap-2 px-3 py-2.5 mb-1 text-xs font-semibold text-white/80 hover:text-white border-b border-white/10 transition-colors"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span>{title}</span>
    </button>
  )

  const HomeRow = ({ label, value, onClick }: { label: string; value: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-white/85 hover:bg-white/10 transition-colors rounded-lg"
    >
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-1.5 text-white/45">
        <span className="max-w-[110px] truncate">{value}</span>
        <ChevronRight />
      </span>
    </button>
  )

  const optionClass = (active: boolean) =>
    `w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors hover:bg-white/10 ${
      active ? 'text-violet-400 bg-violet-500/10 font-semibold' : 'text-white/75 hover:text-white'
    }`

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
            {/* ── Unified settings (gear): Source · Subtitles · Quality ────────── */}
            <div className="relative">
              <button
                onClick={openSettings}
                aria-label="Playback settings"
                title="Settings"
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${
                  showSettings ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>

              {showSettings && (
                <>
                  {/* Click-away backdrop */}
                  <div className="fixed inset-0 z-40" onClick={closeSettings} />

                  <div className="absolute bottom-12 right-0 z-50 w-[260px] max-h-[62vh] overflow-y-auto bg-black/95 backdrop-blur-md rounded-xl border border-white/15 shadow-2xl py-1.5 px-1 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">

                    {/* ── Home: category list ──────────────────────────────────── */}
                    {menuView === 'home' && (
                      <div className="py-0.5">
                        <p className="px-4 pt-1 pb-2 text-[10px] font-bold text-white/35 uppercase tracking-wider">Settings</p>
                        {hasSources && <HomeRow label="Source" value={activeSourceName} onClick={() => setMenuView('source')} />}
                        <HomeRow label="Subtitles" value={activeSubtitleName} onClick={() => setMenuView('subtitles')} />
                        {hasQuality && <HomeRow label="Quality" value={activeQualityName} onClick={() => setMenuView('quality')} />}
                      </div>
                    )}

                    {/* ── Source ───────────────────────────────────────────────── */}
                    {menuView === 'source' && (
                      <div>
                        <BackHeader title="Source" />
                        {availableSources.map((s) => (
                          <button
                            key={s.id}
                            disabled={switchingSource}
                            onClick={() => { onSourceChange?.(s.id); closeSettings() }}
                            className={optionClass(activeSourceId === s.id)}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex-shrink-0">A</span>
                              <span className="truncate">{s.name}</span>
                            </span>
                            {activeSourceId === s.id && <span className="text-violet-400 text-[10px] font-bold flex-shrink-0">✓</span>}
                          </button>
                        ))}
                        {shutDownSources.length > 0 && availableSources.length > 0 && <div className="border-t border-white/8 my-1" />}
                        {shutDownSources.map((s) => (
                          <button
                            key={s.id}
                            disabled={switchingSource}
                            onClick={() => { onSourceChange?.(s.id); closeSettings() }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors hover:bg-white/5 ${
                              activeSourceId === s.id ? 'text-violet-400 bg-violet-500/10 font-semibold' : 'text-white/35 hover:text-white/55'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-400/60 border border-red-500/20 flex-shrink-0">S</span>
                              <span className="truncate">{s.name}</span>
                            </span>
                            {activeSourceId === s.id && <span className="text-violet-400 text-[10px] font-bold flex-shrink-0">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* ── Subtitles ────────────────────────────────────────────── */}
                    {menuView === 'subtitles' && (
                      <div>
                        <BackHeader title="Subtitles" />
                        <button onClick={() => onSubtitleChange(-1)} className={optionClass(currentSubtitle < 0)}>
                          <span>Off</span>
                          {currentSubtitle < 0 && <span className="text-violet-400 text-[10px] font-bold">✓</span>}
                        </button>
                        {subtitleTracks.map((t) => (
                          <button key={t.id} onClick={() => onSubtitleChange(t.id)} className={optionClass(currentSubtitle === t.id)}>
                            <span className="truncate pr-2">{t.name}</span>
                            {currentSubtitle === t.id && <span className="text-violet-400 text-[10px] font-bold flex-shrink-0">✓</span>}
                          </button>
                        ))}
                        {subtitleTracks.length === 0 && (
                          <div className="px-3 py-3 text-[11px] text-white/40 italic text-center">No subtitles found for this title</div>
                        )}

                        {/* Subtitle size — global preference, remembered across titles */}
                        {subtitleTracks.length > 0 && (
                          <div className="mt-1 px-3 pt-1.5 pb-1 border-t border-white/10">
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

                        {/* Auto-sync (VAD) + manual delay — only for external tracks (>= 1000). */}
                        {currentSubtitle >= 1000 && onAutoSync && (
                          <div className="mt-1 px-3 pt-1.5 pb-1 border-t border-white/10">
                            <button
                              onClick={() => { if (autoSyncState !== 'running') onAutoSync() }}
                              disabled={autoSyncState === 'running'}
                              className={`w-full flex items-center justify-center gap-2 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
                                autoSyncState === 'running'
                                  ? 'bg-white/5 text-white/50 cursor-wait'
                                  : autoSyncState === 'done'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : autoSyncState === 'fail'
                                  ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                                  : 'bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30'
                              }`}
                            >
                              {autoSyncState === 'running' && (
                                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              )}
                              <span>
                                {autoSyncState === 'running' ? 'Listening & syncing…'
                                  : autoSyncState === 'done' ? 'Synced ✓'
                                  : autoSyncState === 'fail' ? "Couldn't auto-sync — nudge below"
                                  : 'Auto-sync subtitles'}
                              </span>
                            </button>
                            <p className="text-[9px] text-white/30 mt-1 leading-tight">Keep playing for a few seconds while it matches subtitles to the dialogue.</p>
                          </div>
                        )}

                        {/* Subtitle sync delay — only for external tracks (>= 1000). */}
                        {currentSubtitle >= 1000 && (
                          <div className="mt-1 px-3 pt-1.5 pb-1 border-t border-white/10">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Manual delay</p>
                              {subtitleOffset !== 0 && (
                                <button onClick={() => onSubtitleOffsetChange(0)} className="text-[10px] text-white/40 hover:text-white transition-colors" title="Reset to 0">
                                  Reset
                                </button>
                              )}
                            </div>
                            <div className="flex items-center justify-between bg-white/5 rounded px-2 py-1 border border-white/5">
                              <button
                                onClick={() => onSubtitleOffsetChange(Math.round((subtitleOffset - 0.5) * 10) / 10)}
                                className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-white text-xs font-bold transition-all active:scale-90"
                                title="Show subtitles 0.5s earlier (they're lagging behind)"
                              >
                                −
                              </button>
                              <span className="text-white text-[11px] font-semibold select-none tabular-nums">
                                {subtitleOffset === 0 ? '0.0s' : `${subtitleOffset > 0 ? '+' : ''}${subtitleOffset.toFixed(1)}s`}
                              </span>
                              <button
                                onClick={() => onSubtitleOffsetChange(Math.round((subtitleOffset + 0.5) * 10) / 10)}
                                className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-white text-xs font-bold transition-all active:scale-90"
                                title="Show subtitles 0.5s later (they're appearing too early)"
                              >
                                +
                              </button>
                            </div>
                            <p className="text-[9px] text-white/30 mt-1 leading-tight">− earlier if subtitles lag · + later if they're ahead</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Quality ──────────────────────────────────────────────── */}
                    {menuView === 'quality' && (
                      <div>
                        <BackHeader title="Quality" />
                        <button onClick={() => { onLevelChange(-1); setMenuView('home') }} className={optionClass(currentLevel === -1)}>
                          <span>Auto</span>
                          {currentLevel === -1 && <span className="text-violet-400 text-[10px] font-bold">✓</span>}
                        </button>
                        {visibleLevels.map(({ height, idx }) => (
                          <button key={height} onClick={() => { onLevelChange(idx); setMenuView('home') }} className={optionClass(currentLevel === idx)}>
                            <span>{height}p</span>
                            {currentLevel === idx && <span className="text-violet-400 text-[10px] font-bold">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

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
