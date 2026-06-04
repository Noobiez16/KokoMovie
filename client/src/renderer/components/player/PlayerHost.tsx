import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { catalogApi, type Episode } from '../../api/catalog'
import { playbackApi, type PlaybackSession } from '../../api/playback'
import { downloadsApi } from '../../api/downloads'
import { providersApi } from '../../api/providers'
import { useAuthStore } from '../../store/auth'
import { usePlayerStore } from '../../store/player'
import { LOCAL_PROFILE_ID } from '../../lib/local-identity'

// Lazy-load the heavy player (pulls in hls.js, ~570 kB). PlayerHost is always mounted at
// the app root, but the actual VideoPlayer chunk is only fetched the first time something
// plays — so startup stays light for users who are just browsing.
const VideoPlayer = lazy(() => import('./VideoPlayer').then((m) => ({ default: m.VideoPlayer })))

// Picture-in-Picture box geometry. 16:9, user-resizable, anchored to the bottom-right
// corner so it stays put when the window grows to fullscreen (instead of drifting centre).
const PIP_DEFAULT_W = 360
const PIP_MIN_W = 256
const PIP_MAX_W = 960
const PIP_ASPECT = 9 / 16 // height / width
const pipHeight = (w: number) => Math.round(w * PIP_ASPECT)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Global, always-mounted host for the one and only VideoPlayer instance.
 *
 * Lifting the player out of the /player route (it used to live in `pages/Player.tsx`) is
 * what lets playback survive navigation: this component renders once at the app root, so
 * switching routes — or shrinking into Picture-in-Picture — never unmounts the <video>.
 * Between fullscreen and PiP only the wrapper's size/position changes; the keyed
 * VideoPlayer keeps its identity and keeps playing.
 *
 * It owns the playback orchestration (content fetch, session creation, offline manifests,
 * next-episode extraction) driven entirely by the `usePlayerStore` request.
 */
export function PlayerHost() {
  const navigate = useNavigate()
  const { activeProfile } = useAuthStore()
  const profileId = activeProfile?.id ?? LOCAL_PROFILE_ID

  const request = usePlayerStore((s) => s.request)
  const mode = usePlayerStore((s) => s.mode)
  const launchToken = usePlayerStore((s) => s.launchToken)
  const patchRequest = usePlayerStore((s) => s.patchRequest)
  const stop = usePlayerStore((s) => s.stop)
  const enterPip = usePlayerStore((s) => s.enterPip)
  const exitPip = usePlayerStore((s) => s.exitPip)

  const contentId = request?.contentId
  const episodeId = request?.episodeId

  const [session, setSession] = useState<PlaybackSession | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [nextEpisodeLoading, setNextEpisodeLoading] = useState(false)
  const [offlineManifestUrl, setOfflineManifestUrl] = useState<string | null>(null)

  const { data: contentData, isLoading } = useQuery({
    queryKey: ['content', contentId, profileId],
    queryFn: () => catalogApi.getContent(contentId!, profileId),
    staleTime: 10 * 60 * 1000,
    enabled: !!contentId,
  })

  const content = contentData?.data
  const sortedContent = useMemo(() => {
    if (!content) return null
    const sortedSeasons = [...content.seasons]
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .map((s) => ({ ...s, episodes: [...s.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber) }))
    return { ...content, seasons: sortedSeasons }
  }, [content])

  const currentEpisode: Episode | null = useMemo(() => {
    if (!sortedContent || !episodeId) return null
    for (const season of sortedContent.seasons) {
      const ep = season.episodes.find((e) => e.id === episodeId)
      if (ep) return ep
    }
    return null
  }, [sortedContent, episodeId])

  const nextEpisode: Episode | null = useMemo(() => {
    if (!sortedContent || !currentEpisode) return null
    for (const season of sortedContent.seasons) {
      const idx = season.episodes.findIndex((e) => e.id === currentEpisode.id)
      if (idx === -1) continue
      if (idx + 1 < season.episodes.length) return season.episodes[idx + 1] ?? null
      const nextSeasonIdx = sortedContent.seasons.findIndex((s) => s.id === season.id) + 1
      if (nextSeasonIdx < sortedContent.seasons.length) {
        const nextSeason = sortedContent.seasons[nextSeasonIdx]
        return [...(nextSeason?.episodes || [])].sort((a, b) => a.episodeNumber - b.episodeNumber)[0] ?? null
      }
      return null
    }
    return null
  }, [sortedContent, currentEpisode])

  // Revoke the offline blob URL when it changes / on teardown.
  useEffect(() => () => { if (offlineManifestUrl) URL.revokeObjectURL(offlineManifestUrl) }, [offlineManifestUrl])

  // Build a playback session for the active request. Re-runs on a fresh launch (launchToken),
  // an episode change, or a new stream URL (next-episode / source switch via patchRequest).
  useEffect(() => {
    if (!sortedContent || !request) return
    setSessionError(null)
    // Clear first so a stale video never shows for a new request. For the synchronous
    // (direct/synthetic) paths React batches this with the set below — no blank flash.
    setSession(null)

    if (request.offlineId) {
      downloadsApi.getManifest(request.offlineId)
        .then((res) => {
          if (!res) { setSessionError('Offline download not found'); return }
          if (res.manifestContent.startsWith('direct:')) {
            setSession({ sessionId: request.offlineId!, manifestUrl: res.manifestContent.substring(7), drmKeyId: res.drmKeyId, expiresIn: 14400 })
          } else {
            const url = URL.createObjectURL(new Blob([res.manifestContent], { type: 'application/x-mpegURL' }))
            setOfflineManifestUrl(url)
            setSession({ sessionId: request.offlineId!, manifestUrl: url, drmKeyId: res.drmKeyId, expiresIn: 14400 })
          }
        })
        .catch((err: Error) => setSessionError(err.message ?? 'Failed to load offline manifest'))
      return
    }

    if (request.streamUrl) {
      setSession({ sessionId: crypto.randomUUID(), manifestUrl: request.streamUrl, drmKeyId: null, expiresIn: 14400 })
      return
    }

    const targetEpisode = episodeId ? sortedContent.seasons.flatMap((s) => s.episodes).find((e) => e.id === episodeId) : null
    const s3HlsKey = targetEpisode?.s3HlsKey ?? sortedContent.s3HlsKey ?? `movies/${sortedContent.id}/hls/master.m3u8`
    const durationSeconds = targetEpisode?.durationMins ? targetEpisode.durationMins * 60 : (sortedContent.durationMins ?? 90) * 60

    playbackApi.createSession({ contentId: sortedContent.id, episodeId, s3HlsKey, drmKeyId: sortedContent.drmKeyId ?? undefined, durationSeconds }, profileId)
      .then((res) => setSession(res.data))
      .catch((err: Error) => setSessionError(err.message ?? 'Failed to create playback session'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedContent?.id, episodeId, request?.streamUrl, request?.offlineId, launchToken, profileId])

  // Advance to the next episode by extracting a fresh stream and patching the request in
  // place. Because the host stays mounted, this re-runs the session effect and plays the
  // next episode without any navigation (works identically in fullscreen and PiP).
  const handleNextEpisode = useCallback(async (ep: Episode) => {
    if (!sortedContent) return
    let seasonNumber: number | undefined
    for (const s of sortedContent.seasons) if (s.episodes.some((e) => e.id === ep.id)) { seasonNumber = s.seasonNumber; break }

    const req: StreamRequest = {
      imdbId: sortedContent.imdbId ?? undefined,
      tmdbId: sortedContent.tmdbId ?? undefined,
      type: sortedContent.type === 'series' ? 'tv' : 'movie',
      title: sortedContent.title,
      ...(seasonNumber !== undefined ? { season: seasonNumber, episode: ep.episodeNumber } : {}),
    }

    setNextEpisodeLoading(true)
    setSessionError(null)
    try {
      const result = await Promise.race([
        providersApi.getFirstStream(req),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 50000)),
      ])
      if (result && result.streams.length > 0) {
        patchRequest({
          episodeId: ep.id,
          streamUrl: result.streams[0]!.url,
          streamHeaders: result.streams[0]!.headers,
          providerId: result.providerId,
          allStreams: result.allStreams || [],
          resumeAtSeconds: 0,
          offlineId: undefined,
        })
      } else {
        setSessionError('No working stream found for the next episode.')
      }
    } catch {
      setSessionError('Could not load the next episode.')
    } finally {
      setNextEpisodeLoading(false)
    }
  }, [sortedContent, patchRequest])

  const handleClose = useCallback(() => {
    const cid = contentId
    const wasFull = mode === 'full'
    stop()
    // From fullscreen, drop back to the title's detail page. From PiP, just dismiss and
    // leave the user wherever they were browsing.
    if (wasFull) navigate(cid ? `/content/${cid}` : '/browse')
  }, [mode, contentId, stop, navigate])

  // Minimise: keep playing, drop into PiP, and hand the main outlet back to the user
  // (Home is a sensible landing spot to start browsing from).
  const handlePip = useCallback(() => {
    enterPip()
    navigate('/browse')
  }, [enterPip, navigate])

  const handleExpand = useCallback(() => {
    exitPip()
    if (contentId) navigate(`/player/${contentId}${episodeId ? `/${episodeId}` : ''}`)
  }, [exitPip, navigate, contentId, episodeId])

  // ── PiP geometry: drag + resize ───────────────────────────────────────────────
  // Position is stored as an offset from the bottom-right CORNER (right/bottom), not as
  // absolute top-left coords — so the box stays anchored to the corner when the viewport
  // resizes (e.g. entering fullscreen) instead of appearing to drift toward the centre.
  const [pipOffset, setPipOffset] = useState({ right: 20, bottom: 20 })
  const [pipSize, setPipSize] = useState({ w: PIP_DEFAULT_W, h: pipHeight(PIP_DEFAULT_W) })
  const offsetRef = useRef(pipOffset); offsetRef.current = pipOffset
  const sizeRef = useRef(pipSize); sizeRef.current = pipSize
  const dragRef = useRef<{ startX: number; startY: number; right: number; bottom: number } | null>(null)
  const resizeRef = useRef<{ startX: number; w: number } | null>(null)

  // Drag: move the box (dragging right/down shrinks the right/bottom offsets).
  const onDragMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current; if (!d) return
    const { w, h } = sizeRef.current
    setPipOffset({
      right: clamp(d.right - (e.clientX - d.startX), 8, window.innerWidth - w - 8),
      bottom: clamp(d.bottom - (e.clientY - d.startY), 8, window.innerHeight - h - 8),
    })
  }, [])
  const onDragUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
  }, [onDragMove])
  const onDragStart = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, right: offsetRef.current.right, bottom: offsetRef.current.bottom }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp)
  }, [onDragMove, onDragUp])

  // Resize: top-left grip. Because the box is anchored bottom-right, dragging the grip
  // up/left grows it (16:9-locked) while the bottom-right corner stays pinned.
  const onResizeMove = useCallback((e: PointerEvent) => {
    const r = resizeRef.current; if (!r) return
    const off = offsetRef.current
    const maxByLeft = window.innerWidth - off.right - 8
    const maxByTop = (window.innerHeight - off.bottom - 8) / PIP_ASPECT
    const maxW = Math.max(PIP_MIN_W, Math.min(PIP_MAX_W, maxByLeft, maxByTop))
    const w = clamp(r.w + (r.startX - e.clientX), PIP_MIN_W, maxW)
    setPipSize({ w, h: pipHeight(w) })
  }, [])
  const onResizeUp = useCallback(() => {
    resizeRef.current = null
    window.removeEventListener('pointermove', onResizeMove)
    window.removeEventListener('pointerup', onResizeUp)
  }, [onResizeMove])
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation() // don't let the grip start a drag
    resizeRef.current = { startX: e.clientX, w: sizeRef.current.w }
    window.addEventListener('pointermove', onResizeMove)
    window.addEventListener('pointerup', onResizeUp)
  }, [onResizeMove, onResizeUp])

  // Keep the PiP box fully on-screen (and not larger than the viewport) when the window
  // is resized — including when the app toggles native fullscreen.
  useEffect(() => {
    if (mode !== 'pip') return
    const onWinResize = () => {
      setPipSize((s) => {
        const maxW = Math.max(PIP_MIN_W, Math.min(PIP_MAX_W, window.innerWidth - 16, (window.innerHeight - 16) / PIP_ASPECT))
        const w = clamp(s.w, PIP_MIN_W, maxW)
        return { w, h: pipHeight(w) }
      })
      setPipOffset((o) => ({
        right: clamp(o.right, 8, window.innerWidth - sizeRef.current.w - 8),
        bottom: clamp(o.bottom, 8, window.innerHeight - sizeRef.current.h - 8),
      }))
    }
    window.addEventListener('resize', onWinResize)
    return () => window.removeEventListener('resize', onWinResize)
  }, [mode])

  if (!request) return null

  const isPip = mode === 'pip'
  const showLoading = nextEpisodeLoading || isLoading || (!session && !sessionError)

  const wrapperClass = isPip
    ? 'group fixed z-[60] rounded-xl overflow-hidden border border-km-border/60 shadow-2xl shadow-black/70 bg-black ring-1 ring-violet-500/20'
    : 'fixed inset-0 z-[60] bg-black'
  const wrapperStyle: React.CSSProperties | undefined = isPip
    ? { right: pipOffset.right, bottom: pipOffset.bottom, width: pipSize.w, height: pipSize.h }
    : undefined

  const title = sortedContent?.title ?? 'Loading…'
  const spinner = (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
        <p className="text-white/40 text-xs">{nextEpisodeLoading ? 'Loading next episode…' : 'Starting playback…'}</p>
      </div>
    </div>
  )

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      {sessionError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-center px-4">
          <div>
            <p className="text-white/60 text-sm mb-3">{sessionError}</p>
            <button onClick={handleClose} className="bg-white/10 text-white px-4 py-2 rounded text-sm hover:bg-white/20 transition-colors">
              Go Back
            </button>
          </div>
        </div>
      ) : showLoading ? (
        spinner
      ) : session && sortedContent ? (
        <Suspense fallback={spinner}>
          <VideoPlayer
            key="km-active-player"
            embedded={isPip}
            content={sortedContent}
            episode={currentEpisode}
            session={session}
            streamHeaders={request.streamHeaders}
            initialProviderId={request.providerId}
            allStreams={request.allStreams ?? []}
            profileId={profileId}
            resumeAtSeconds={request.resumeAtSeconds}
            onClose={handleClose}
            onPip={handlePip}
            onNextEpisode={handleNextEpisode}
            nextEpisode={nextEpisode}
          />
        </Suspense>
      ) : null}

      {/* Click anywhere in the PiP body to return to fullscreen. This sits ABOVE the video
          (z-50) so a click expands instead of hitting the video's play/pause. It's fully
          transparent — the affordance is the title bar, which fades in on hover. */}
      {isPip && (
        <button
          key="km-pip-expand"
          onClick={handleExpand}
          title="Back to fullscreen"
          aria-label="Back to fullscreen"
          className="absolute inset-0 z-[55] cursor-pointer"
        />
      )}

      {/* Resize grip (top-left). The box is anchored bottom-right, so dragging this up/left
          enlarges it. Fades in on hover, like the title bar. */}
      {isPip && (
        <div
          key="km-pip-resize"
          onPointerDown={onResizeStart}
          title="Resize"
          className="absolute top-0 left-0 z-[80] w-5 h-5 p-1 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            <polyline points="9 3 3 3 3 9" />
            <line x1="3" y1="3" x2="11" y2="11" />
          </svg>
        </div>
      )}

      {/* PiP chrome — drag handle + expand/close. Hidden until the pointer is over the PiP
          (group-hover on the wrapper), then fades in. Keyed so toggling modes never
          reshuffles (remounts) the keyed VideoPlayer. */}
      {isPip && (
        <div
          key="km-pip-chrome"
          onPointerDown={onDragStart}
          className="absolute top-0 left-0 right-0 z-[70] flex items-center justify-between gap-2 pl-7 pr-2.5 py-1.5 bg-gradient-to-b from-black/85 to-transparent cursor-grab active:cursor-grabbing select-none opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <span className="text-white text-[11px] font-semibold truncate pr-1">{title}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); handleExpand() }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Expand"
              className="w-6 h-6 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleClose() }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Close"
              className="w-6 h-6 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-red-500/40 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
