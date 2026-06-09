import { useEffect } from 'react'
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { usePlayerStore, type CachedStream } from '../store/player'

/**
 * Thin launcher for the /player route. The actual <VideoPlayer> lives in the global
 * <PlayerHost> (mounted at the app root) so playback survives navigation and Picture-in-
 * Picture. This route's only job is to translate the URL + navigation state into a
 * playback request on the store, then render a black backdrop while the host paints.
 */
export function PlayerPage() {
  const { contentId, episodeId } = useParams<{ contentId: string; episodeId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const play = usePlayerStore((s) => s.play)
  const setMode = usePlayerStore((s) => s.setMode)

  useEffect(() => {
    if (!contentId) { navigate('/browse', { replace: true }); return }

    const state = location.state as {
      streamUrl?: string
      streamHeaders?: Record<string, string>
      providerId?: string
      allStreams?: CachedStream[]
      resumeAtSeconds?: number
      searchId?: string
    } | null
    const offlineId = new URLSearchParams(location.search).get('offline') || undefined

    const { request } = usePlayerStore.getState()
    const sameTitle = !!request && request.contentId === contentId && request.episodeId === episodeId
    // Returning from PiP (the "expand" button navigates here) with no fresh stream info —
    // just go fullscreen and keep the in-progress playback exactly where it is.
    if (sameTitle && !state?.streamUrl && !offlineId) {
      setMode('full')
      return
    }

    play({
      contentId,
      episodeId,
      streamUrl: state?.streamUrl,
      streamHeaders: state?.streamHeaders,
      providerId: state?.providerId,
      allStreams: state?.allStreams,
      resumeAtSeconds: state?.resumeAtSeconds,
      offlineId,
      searchId: state?.searchId,
    })
  // location.key changes on every navigation, so re-entering /player always re-syncs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, episodeId, location.key])

  if (!contentId) return <Navigate to="/browse" replace />

  // Backdrop only — PlayerHost renders the fullscreen player on top (z-[60]).
  return <div className="fixed inset-0 bg-black z-40" />
}
