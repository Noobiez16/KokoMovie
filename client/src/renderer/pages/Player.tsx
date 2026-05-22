import { useState, useEffect } from 'react'
import { useParams, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { catalogApi, type Episode } from '../api/catalog'
import { playbackApi, type PlaybackSession } from '../api/playback'
import { downloadsApi } from '../api/downloads'
import { VideoPlayer } from '../components/player/VideoPlayer'

export function PlayerPage() {
  const { contentId, episodeId } = useParams<{ contentId: string; episodeId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, activeProfile } = useAuthStore()
  const [session, setSession] = useState<PlaybackSession | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | undefined>(episodeId)

  // Direct stream URL + headers injected by ContentDetail source picker (providers mode)
  const locationState = location.state as {
    streamUrl?: string
    streamHeaders?: Record<string, string>
    providerId?: string
    allStreams?: Array<{ providerId: string; providerName: string; streams: Array<{ url: string; quality: string; headers?: Record<string, string> }> }>
    resumeAtSeconds?: number
  } | null
  const directStreamUrl: string | undefined = locationState?.streamUrl
  const directStreamHeaders: Record<string, string> | undefined = locationState?.streamHeaders
  const resumeAtSeconds: number | undefined = locationState?.resumeAtSeconds
  const initialProviderId: string | undefined = locationState?.providerId
  const allStreams = locationState?.allStreams || []

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!activeProfile) return <Navigate to="/profiles" replace />
  if (!contentId) return <Navigate to="/browse" replace />

  const profileId = activeProfile.id

  const { data: contentData, isLoading } = useQuery({
    queryKey: ['content', contentId, profileId],
    queryFn: () => catalogApi.getContent(contentId, profileId),
    staleTime: 10 * 60 * 1000,
  })

  const content = contentData?.data
  const sortedContent = (() => {
    if (!content) return null
    const sortedSeasons = [...content.seasons]
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .map((s) => ({
        ...s,
        episodes: [...s.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber),
      }))
    return {
      ...content,
      seasons: sortedSeasons,
    }
  })()

  // Find current episode
  const currentEpisode: Episode | null = (() => {
    if (!sortedContent || !currentEpisodeId) return null
    for (const season of sortedContent.seasons) {
      const ep = season.episodes.find((e) => e.id === currentEpisodeId)
      if (ep) return ep
    }
    return null
  })()

  // Find next episode
  const nextEpisode: Episode | null = (() => {
    if (!sortedContent || !currentEpisode) return null
    for (const season of sortedContent.seasons) {
      const idx = season.episodes.findIndex((e) => e.id === currentEpisode.id)
      if (idx === -1) continue
      if (idx + 1 < season.episodes.length) return season.episodes[idx + 1] ?? null
      // Check next season
      const nextSeasonIdx = sortedContent.seasons.findIndex((s) => s.id === season.id) + 1
      if (nextSeasonIdx < sortedContent.seasons.length) {
        const nextSeason = sortedContent.seasons[nextSeasonIdx]
        const sortedNextSeasonEps = [...(nextSeason?.episodes || [])].sort((a, b) => a.episodeNumber - b.episodeNumber)
        return sortedNextSeasonEps[0] ?? null
      }
      return null
    }
    return null
  })()

  const [offlineManifestUrl, setOfflineManifestUrl] = useState<string | null>(null)

  // Clean up offline blob URL on unmount or URL change
  useEffect(() => {
    return () => {
      if (offlineManifestUrl) {
        URL.revokeObjectURL(offlineManifestUrl)
      }
    }
  }, [offlineManifestUrl])

  // Create playback session once content is loaded
  useEffect(() => {
    if (!sortedContent) return

    const offlineId = new URLSearchParams(location.search).get('offline')

    if (offlineId) {
      downloadsApi.getManifest(offlineId)
        .then((res) => {
          if (!res) {
            setSessionError('Offline download not found')
            return
          }
          if (res.manifestContent.startsWith('direct:')) {
            const url = res.manifestContent.substring(7)
            setSession({
              sessionId: offlineId,
              manifestUrl: url,
              drmKeyId: res.drmKeyId,
              expiresIn: 14400,
            })
          } else {
            const blob = new Blob([res.manifestContent], { type: 'application/x-mpegURL' })
            const url = URL.createObjectURL(blob)
            setOfflineManifestUrl(url)
            setSession({
              sessionId: offlineId,
              manifestUrl: url,
              drmKeyId: res.drmKeyId,
              expiresIn: 14400,
            })
          }
        })
        .catch((err: Error) => {
          setSessionError(err.message ?? 'Failed to load offline manifest')
        })
      return
    }

    // If a direct stream URL was provided by a provider, create a synthetic session
    if (directStreamUrl) {
      setSession({
        sessionId: crypto.randomUUID(),
        manifestUrl: directStreamUrl,
        drmKeyId: null,
        expiresIn: 14400,
      } satisfies PlaybackSession)
      return
    }

    const targetEpisode = currentEpisodeId
      ? sortedContent.seasons.flatMap((s) => s.episodes).find((e) => e.id === currentEpisodeId)
      : null

    const s3HlsKey = targetEpisode?.s3HlsKey ?? sortedContent.s3HlsKey ?? `movies/${sortedContent.id}/hls/master.m3u8`
    const durationSeconds = targetEpisode?.durationMins
      ? targetEpisode.durationMins * 60
      : (sortedContent.durationMins ?? 90) * 60

    playbackApi.createSession(
      {
        contentId: sortedContent.id,
        episodeId: currentEpisodeId,
        s3HlsKey,
        drmKeyId: sortedContent.drmKeyId ?? undefined,
        durationSeconds,
      },
      profileId
    )
      .then((res) => setSession(res.data))
      .catch((err: Error) => setSessionError(err.message ?? 'Failed to create playback session'))
  }, [sortedContent?.id, currentEpisodeId, profileId, directStreamUrl, location.search])

  const handleNextEpisode = (ep: Episode) => {
    setSession(null)
    setCurrentEpisodeId(ep.id)
    // Clear state so next episode goes back through source picker
    navigate(`/content/${contentId}`, { replace: true })
  }

  if (isLoading || (!session && !sessionError)) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Starting playback...</p>
        </div>
      </div>
    )
  }

  if (sessionError || !content) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/60 mb-4">{sessionError ?? 'Content not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="bg-white/10 text-white px-4 py-2 rounded hover:bg-white/20 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  if (!session) return null

  return (
    <VideoPlayer
      content={sortedContent!}
      episode={currentEpisode}
      session={session}
      streamHeaders={directStreamHeaders}
      initialProviderId={initialProviderId}
      allStreams={allStreams}
      profileId={profileId}
      resumeAtSeconds={resumeAtSeconds}
      onClose={() => navigate(`/content/${contentId}`)}
      onNextEpisode={handleNextEpisode}
      nextEpisode={nextEpisode}
    />
  )
}
