import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LOCAL_PROFILE } from '../lib/local-identity'
import { useSettingsStore } from '../store/settings'
import { catalogApi, type Episode, type Season } from '../api/catalog'
import { userApi } from '../api/user'
import { recommendationApi } from '../api/recommendation'
import { downloadsApi } from '../api/downloads'
import { providersApi, torrentApi } from '../api/providers'
import { playbackApi } from '../api/playback'
import { AppLayout } from '../components/layout/AppLayout'
import { ContentRow } from '../components/catalog/ContentRow'
import { ResponsiveArtwork } from '../components/catalog/ResponsiveArtwork'
import { SeasonTabs } from '../components/catalog/SeasonTabs'
import { EpisodeCard } from '../components/catalog/EpisodeCard'
import type { ContentSummary } from '../api/catalog'
import { sanitizeMediaUrl } from '../lib/media-url'
import { downloadErrorTranslationKey } from '../lib/download-error-policy'
import { decodeTmdbEpisodeId } from '../lib/tmdb'

const sanitizeUrl = sanitizeMediaUrl
type DownloadTorrentOption = { id: string; name: string; magnet: string; language: string }

const DOWNLOAD_LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', ru: 'Russian' }

async function getDownloadSubtitles(
  content: import('../api/catalog').ContentDetail,
  episode?: Episode,
  seasonNumber?: number,
): Promise<Array<{ lang: string; url: string }>> {
  if (!content.imdbId || !window.electronAPI) return []
  try {
    const { port, capability } = await window.electronAPI.getProxyInfo()
    if (!port || !capability) return []
    const series = content.type === 'series' && episode
    const typePath = series ? 'series' : 'movie'
    const query = series ? `${content.imdbId}:${seasonNumber ?? 1}:${episode.episodeNumber}` : content.imdbId
    const response = await fetch(`http://localhost:${port}/proxy/opensubtitles-v3.strem.io/subtitles/${typePath}/${query}.json?kmc=${encodeURIComponent(capability)}`)
    if (!response.ok) return []
    const data = await response.json() as { subtitles?: Array<{ lang?: unknown; url?: unknown }> }
    return (data.subtitles ?? [])
      .filter((track): track is { lang: string; url: string } => typeof track.lang === 'string' && typeof track.url === 'string')
      .slice(0, 8)
  } catch {
    return []
  }
}


export function ContentDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const activeProfile = LOCAL_PROFILE
  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey)
  const [selectedSeason, setSelectedSeason] = useState(0)
  const [autoStreamState, setAutoStreamState] = useState<{
    loading: boolean
    episode?: Episode
    seasonNumber?: number
    resumeAtSeconds?: number
    error?: string
    isDownload?: boolean
  }>({ loading: false })

  const cancelAutoStreamRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)

  const [prevId, setPrevId] = useState<string | undefined>(id)

  if (id !== prevId) {
    setPrevId(id)
    setSelectedSeason(0)
    setAutoStreamState({ loading: false })
    if (cancelAutoStreamRef.current) {
      cancelAutoStreamRef.current()
      cancelAutoStreamRef.current = null
    }
  }

  const location = useLocation()
  const navState = location.state as {
    tmdbId?: number
    tmdbType?: 'movie' | 'tv'
    autoPlay?: boolean
    resumePosition?: number
    resumeEpisodeId?: string | null
  } | null

  const profileId = activeProfile?.id ?? ''

  // Fetch content metadata
  const { data, isLoading } = useQuery({
    queryKey: ['content', id, profileId],
    queryFn: async () => {
      if (!profileId || !id) throw new Error('Not authenticated')
      // For TMDB items not yet in DB, sync first then fetch
      if (navState?.tmdbId && navState?.tmdbType) {
        try {
          await catalogApi.syncContent(navState.tmdbId, navState.tmdbType)
        } catch { /* ignore sync errors, getContent will handle */ }
      }
      return catalogApi.getContent(id, profileId)
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!profileId && !!id,
  })

  const content = data?.data
  const baseSortedSeasons = useMemo(() => content?.seasons
    ? [...content.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber)
    : [], [content?.seasons])
  const selectedSeasonNumber = baseSortedSeasons[selectedSeason]?.seasonNumber
  const selectedSeasonNeedsEpisodes = baseSortedSeasons[selectedSeason]?.episodes.length === 0
  const { data: selectedSeasonData, isFetching: isSeasonLoading } = useQuery({
    queryKey: ['season', id, selectedSeasonNumber],
    queryFn: () => catalogApi.getSeason(id!, selectedSeasonNumber!),
    enabled: content?.type === 'series' && !!id && selectedSeasonNumber !== undefined && selectedSeasonNeedsEpisodes,
    staleTime: 10 * 60 * 1000,
  })
  const sortedSeasons = useMemo(() => baseSortedSeasons.map((season) =>
    selectedSeasonData?.data.seasonNumber === season.seasonNumber ? selectedSeasonData.data : season,
  ), [baseSortedSeasons, selectedSeasonData])

  function prefetchSeason(selectedIndex: number): void {
    const adjacent = baseSortedSeasons[selectedIndex]
    if (!id || !adjacent || adjacent.episodes.length > 0) return
    void qc.prefetchQuery({
      queryKey: ['season', id, adjacent.seasonNumber],
      queryFn: () => catalogApi.getSeason(id, adjacent.seasonNumber),
      staleTime: 10 * 60 * 1000,
    })
  }

  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist-check', id, profileId],
    queryFn: () => {
      if (!id || !profileId) throw new Error('Missing parameters')
      return userApi.checkWatchlist(id, profileId)
    },
    staleTime: 30 * 1000,
    enabled: !!profileId && !!id,
  })

  const { data: similarData } = useQuery({
    queryKey: ['similar', id, profileId],
    queryFn: () => {
      if (!id || !profileId) throw new Error('Missing parameters')
      return recommendationApi.getSimilar(id, profileId)
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!profileId && !!id,
  })



  const { data: continueWatchingData } = useQuery({
    queryKey: ['continue-watching', profileId, tmdbApiKey],
    queryFn: () => {
      if (!profileId) throw new Error('Missing parameters')
      return playbackApi.getContinueWatching(profileId)
    },
    staleTime: 30 * 1000,
    enabled: !!profileId,
  })

  const inWatchlist = watchlistData?.data?.inWatchlist ?? false

  const addMutation = useMutation({
    mutationFn: () => {
      if (!id || !profileId) throw new Error('Missing parameters')
      return userApi.addToWatchlist(id, content?.type ?? 'movie', profileId)
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['watchlist-check', id, profileId] })
      const previousWatchlistCheck = qc.getQueryData(['watchlist-check', id, profileId])
      qc.setQueryData(['watchlist-check', id, profileId], {
        success: true,
        data: { inWatchlist: true }
      })
      return { previousWatchlistCheck }
    },
    onError: (err, _variables, context) => {
      console.error('Failed to add to watchlist:', err)
      if (context?.previousWatchlistCheck) {
        qc.setQueryData(['watchlist-check', id, profileId], context.previousWatchlistCheck)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['watchlist-check', id, profileId] })
      qc.invalidateQueries({ queryKey: ['watchlist', profileId] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => {
      if (!id || !profileId) throw new Error('Missing parameters')
      return userApi.removeFromWatchlist(id, profileId)
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['watchlist-check', id, profileId] })
      const previousWatchlistCheck = qc.getQueryData(['watchlist-check', id, profileId])
      qc.setQueryData(['watchlist-check', id, profileId], {
        success: true,
        data: { inWatchlist: false }
      })
      return { previousWatchlistCheck }
    },
    onError: (err, _variables, context) => {
      console.error('Failed to remove from watchlist:', err)
      if (context?.previousWatchlistCheck) {
        qc.setQueryData(['watchlist-check', id, profileId], context.previousWatchlistCheck)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['watchlist-check', id, profileId] })
      qc.invalidateQueries({ queryKey: ['watchlist', profileId] })
    },
  })

  const [downloading, setDownloading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)

  const [showActionsDropdown, setShowActionsDropdown] = useState(false)
  const [episodeDownloadingMap, setEpisodeDownloadingMap] = useState<Record<string, boolean>>({})
  const [episodeDownloadDoneMap, setEpisodeDownloadDoneMap] = useState<Record<string, boolean>>({})
  const [downloadPicker, setDownloadPicker] = useState<{ kind: "movie" | "series" | "episode"; episode?: Episode; seasonNumber?: number } | null>(null)
  const [downloadProviders, setDownloadProviders] = useState<Array<{ id: string; name: string; enabled: boolean }>>([])
  const [downloadTorrents, setDownloadTorrents] = useState<DownloadTorrentOption[]>([])
  const [downloadTorrentsLoading, setDownloadTorrentsLoading] = useState(false)

  function selectedDownloadTitle(base: string, providerId: string): string {
    const torrent = downloadTorrents.find((option) => option.id === providerId)
    return torrent ? `${base} [${torrent.language.toUpperCase()}]` : base
  }

  async function openDownloadPicker(target: { kind: "movie" | "series" | "episode"; episode?: Episode; seasonNumber?: number }) {
    setDownloadPicker(target)
    setDownloadTorrents([])
    setDownloadTorrentsLoading(target.kind !== "series")
    try { setDownloadProviders((await providersApi.list()).filter((provider) => provider.enabled)) } catch { setDownloadProviders([]) }

    const c = data?.data
    if (!c || target.kind === "series") return
    const req: StreamRequest = {
      imdbId: c.imdbId ?? undefined,
      tmdbId: c.tmdbId ?? undefined,
      type: c.type === "series" ? "tv" : "movie",
      title: c.title,
    }
    if (target.episode) {
      req.season = target.seasonNumber
      req.episode = target.episode.episodeNumber
    }
    try {
      const releases = await torrentApi.getStreams(req)
      const options = releases.flatMap((release) => {
        const stream = release.streams[0]
        if (!stream?.url.startsWith("magnet:")) return []
        return (stream.audioLangs ?? []).filter((lang) => DOWNLOAD_LANGUAGE_NAMES[lang]).map((language) => ({
          id: `torrent:${release.providerId}:${language}`,
          name: `${DOWNLOAD_LANGUAGE_NAMES[language]} · ${release.providerName}`,
          magnet: stream.url,
          language,
        }))
      })
      setDownloadTorrents(options)
    } catch {
      setDownloadTorrents([])
    } finally {
      setDownloadTorrentsLoading(false)
    }
  }


  // Default selected season to Season 1 if available, otherwise 0
  useEffect(() => {
    if (baseSortedSeasons.length > 0) {
      const resumeSeason = decodeTmdbEpisodeId(navState?.resumeEpisodeId)?.season
      const resumeIdx = resumeSeason === undefined ? -1 : baseSortedSeasons.findIndex((s) => s.seasonNumber === resumeSeason)
      const s1Idx = baseSortedSeasons.findIndex((s) => s.seasonNumber === 1)
      if (resumeIdx !== -1) {
        setSelectedSeason(resumeIdx)
      } else if (s1Idx !== -1) {
        setSelectedSeason(s1Idx)
      } else {
        setSelectedSeason(0)
      }
    }
  // This is an initialization effect: loaded season data and cleared router state must not reset
  // a season the user selected after the content identity was established.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content?.id])

  const handleAutoStreamRef = useRef(handleAutoStream)
  handleAutoStreamRef.current = handleAutoStream

  const launchedEntryRef = useRef<string | null>(null)
  useEffect(() => {
    // Metadata must pass the catalog's maturity check before source discovery.
    if (isLoading || !content || content.type !== 'movie' || navState?.autoPlay !== true) return
    if (launchedEntryRef.current === location.key) return
    launchedEntryRef.current = location.key
    const state = { ...navState }
    delete state.autoPlay
    // Consume the intent in history before starting, including cancel and Back paths.
    navigate(location.pathname + location.search + location.hash, { replace: true, state })
    void handleAutoStreamRef.current()
  }, [isLoading, content, navState, location.key, location.pathname, location.search, location.hash, navigate])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Auto-resume from router state if resumePosition is present
  useEffect(() => {
    if (!content) return
    const resumePosition = navState?.resumePosition
    const resumeEpisodeId = navState?.resumeEpisodeId

    if (resumePosition !== undefined && resumePosition > 0) {
      // Clear navigation state to prevent auto-resume loops
      // Ensure redirect path is relative and safe to prevent open redirect
      const safePath = location.pathname.startsWith('/') && !location.pathname.startsWith('//')
        ? location.pathname
        : '/browse'
      navigate(safePath, {
        replace: true,
        state: {
          ...navState,
          resumePosition: undefined,
          resumeEpisodeId: undefined,
        },
      })

      if (content.type === 'series' && resumeEpisodeId) {
        // Find the episode and its seasonNumber
        let foundEpisode: Episode | undefined
        let foundSeasonNumber: number | undefined

        for (const s of sortedSeasons) {
          const ep = s.episodes.find((e) => e.id === resumeEpisodeId)
          if (ep) {
            foundEpisode = ep
            foundSeasonNumber = s.seasonNumber
            break
          }
        }

        if (foundEpisode && foundSeasonNumber !== undefined) {
          handleAutoStreamRef.current(foundEpisode, foundSeasonNumber, resumePosition)
        }
      } else if (content.type === 'movie') {
        handleAutoStreamRef.current(undefined, undefined, resumePosition)
      }
    }
  }, [content, navState, location.pathname, navigate, sortedSeasons])

  if (!id) return <Navigate to="/browse" replace />

  async function getOrScrapeManifestUrl(
    c: any,
    episode?: Episode,
    seasonNumber?: number,
    providerId: string = 'best'
  ): Promise<{ url: string; headers?: Record<string, string> } | null> {

    setAutoStreamState({
      loading: true,
      episode,
      seasonNumber,
      error: undefined,
      isDownload: true,
    })

    let cancelled = false
    cancelAutoStreamRef.current = () => {
      cancelled = true
    }

    const req: StreamRequest = {
      imdbId: c.imdbId ?? undefined,
      tmdbId: c.tmdbId ?? undefined,
      type: c.type === 'series' ? 'tv' : 'movie',
      title: c.title,
    }

    if (episode && c.type === 'series') {
      if (seasonNumber !== undefined) {
        req.season = seasonNumber
        req.episode = episode.episodeNumber
      } else {
        for (const s of sortedSeasons) {
          const found = s.episodes.find((ep) => ep.id === episode.id)
          if (found) {
            req.season = s.seasonNumber
            req.episode = episode.episodeNumber
            break
          }
        }
      }
    }

    try {
      const torrent = downloadTorrents.find((option) => option.id === providerId)
      if (torrent) {
        const resolved = await Promise.race([
          torrentApi.resolve(torrent.magnet, torrent.language),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out connecting to torrent peers")), 65000)),
        ])
        if (cancelled) return null
        if (resolved.error || !resolved.url) throw new Error(resolved.error || "Torrent did not return a playable stream")
        setAutoStreamState({ loading: false })
        return { url: resolved.url }
      }

      const result = await Promise.race([
        providerId === 'best' ? providersApi.getFirstStream(req) : providersApi.getStream(providerId, req),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Timed out searching for a stream')), 50000)
        ),
      ])
      if (cancelled) return null

      if (result && result.streams.length > 0) {
        const releaseType = result.streams[0]!.qualityInfo?.releaseType
        if ((releaseType === 'cam' || releaseType === 'telesync') && !window.confirm(t('player.camWarning'))) {
          setAutoStreamState({ loading: false })
          return null
        }
        setAutoStreamState({ loading: false })
        return {
          url: result.streams[0].url,
          headers: result.streams[0].headers,
        }
      } else {
        setAutoStreamState({
          loading: false,
          episode,
          seasonNumber,
        error: t('player.noWorkingStreamDescription'),
          isDownload: true,
        })
        return null
      }
    } catch (err) {
      if (cancelled) return null
      setAutoStreamState({
        loading: false,
        episode,
        seasonNumber,
        error: t('player.automaticSearchFailed', { error: String(err) }),
        isDownload: true,
      })
      return null
    }
  }

  async function handleDownload(providerId: string = 'best') {
    const c = data?.data
    if (!c || downloading || downloadDone) return
    setDownloading(true)
    try {
      const result = await getOrScrapeManifestUrl(c, undefined, undefined, providerId)
      if (!result) return
      const customDownloadPath = localStorage.getItem('custom_download_path') || undefined
      await downloadsApi.start({
        contentId: c.id,
        title: selectedDownloadTitle(c.title, providerId),
        contentType: c.type,
        thumbnailUrl: c.s3Thumbnail ?? undefined,
        durationMins: c.durationMins ?? undefined,
        manifestUrl: result.url,
        customDownloadPath,
        headers: result.headers,
        subtitles: await getDownloadSubtitles(c),
      })
      setDownloadDone(true)
      navigate("/downloads")
    } catch (error) {
      setAutoStreamState({ loading: false, error: t(downloadErrorTranslationKey(error)), isDownload: true })
    } finally {
      setDownloading(false)
    }
  }

  async function handleSeriesDownload(providerId: string = 'best') {
    const c = data?.data
    if (!c || c.type !== 'series') return

    const completeSeasons = await Promise.all(c.seasons.map(async (season) => {
      if (season.episodes.length > 0) return season
      try {
        return (await catalogApi.getSeason(c.id, season.seasonNumber)).data
      } catch {
        return season
      }
    }))
    const downloadableEpisodes: { ep: Episode; seasonNum: number }[] = []
    completeSeasons.forEach((season) => {
      season.episodes.forEach((ep) => {
        downloadableEpisodes.push({ ep, seasonNum: season.seasonNumber })
      })
    })

    if (downloadableEpisodes.length === 0) return

    setDownloading(true)
    try {
      const updatedDoneMap = { ...episodeDownloadDoneMap }
      let allSucceeded = true
      const customDownloadPath = localStorage.getItem('custom_download_path') || undefined
      for (const { ep, seasonNum } of downloadableEpisodes) {
        if (!updatedDoneMap[ep.id]) {
          const result = await getOrScrapeManifestUrl(c, ep, seasonNum, providerId)
          if (!result) {
            allSucceeded = false
            break
          }
          try {
            await downloadsApi.start({
              contentId: c.id,
              episodeId: ep.id,
              title: `${c.title} - S${seasonNum}E${ep.episodeNumber} - ${ep.title}`,
              contentType: 'series',
              thumbnailUrl: ep.s3ThumbnailKey || c.s3Thumbnail || undefined,
              durationMins: ep.durationMins || undefined,
              manifestUrl: result.url,
              customDownloadPath,
              headers: result.headers,
              subtitles: await getDownloadSubtitles(c, ep, seasonNum),
            })
            updatedDoneMap[ep.id] = true
            setEpisodeDownloadDoneMap((prev) => ({ ...prev, [ep.id]: true }))
          } catch (err) {
            console.error(`Failed to download episode S${seasonNum}E${ep.episodeNumber}:`, err)
            setAutoStreamState({ loading: false, error: t(downloadErrorTranslationKey(err)), isDownload: true })
            allSucceeded = false
          }
        }
      }
      if (allSucceeded) {
        setDownloadDone(true)
        navigate("/downloads")
      }
    } finally {
      setDownloading(false)
    }
  }

  async function handleEpisodeDownload(ep: Episode, seasonNumber?: number, providerId: string = 'best') {
    const c = data?.data
    if (!c) return
    const epId = ep.id

    setEpisodeDownloadingMap((prev) => ({ ...prev, [epId]: true }))
    try {
      const result = await getOrScrapeManifestUrl(c, ep, seasonNumber, providerId)
      if (!result) return
      const customDownloadPath = localStorage.getItem('custom_download_path') || undefined
      await downloadsApi.start({
        contentId: c.id,
        episodeId: epId,
        title: selectedDownloadTitle(`${c.title} - S${seasonNumber ?? 1}E${ep.episodeNumber} - ${ep.title}`, providerId),
        contentType: 'series',
        thumbnailUrl: ep.s3ThumbnailKey || c.s3Thumbnail || undefined,
        durationMins: ep.durationMins || undefined,
        manifestUrl: result.url,
        customDownloadPath,
        headers: result.headers,
        subtitles: await getDownloadSubtitles(c, ep, seasonNumber),
      })
      setEpisodeDownloadDoneMap((prev) => ({ ...prev, [epId]: true }))
      navigate("/downloads")
    } catch (err) {
      console.error('Episode download failed:', err)
      setAutoStreamState({ loading: false, episode: ep, seasonNumber, error: t(downloadErrorTranslationKey(err)), isDownload: true })
    } finally {
      setEpisodeDownloadingMap((prev) => ({ ...prev, [epId]: false }))
    }
  }

  // seasonNumber is passed explicitly from the call site (the season the user is viewing) so
  // we never have to re-derive it by searching c.seasons, which may be unsorted or have stale data.
  // resumeAtSeconds is forwarded through navigation state so VideoPlayer can seek on load.
  async function handleAutoStream(episode?: Episode, seasonNumber?: number, resumeAtSeconds?: number) {
    const c = data?.data
    if (!c) return

    setAutoStreamState({ loading: true, episode, seasonNumber, resumeAtSeconds, error: undefined })

    let cancelled = false
    cancelAutoStreamRef.current = () => {
      cancelled = true
    }

    const req: StreamRequest = {
      imdbId: c.imdbId ?? undefined,
      tmdbId: c.tmdbId ?? undefined,
      type: c.type === 'series' ? 'tv' : 'movie',
      title: c.title,
    }

    if (episode && c.type === 'series') {
      if (seasonNumber !== undefined) {
        // Fast path: caller knows exactly which season was selected
        req.season = seasonNumber
        req.episode = episode.episodeNumber
      } else {
        // Fallback: search sortedSeasons (already ordered correctly)
        for (const s of sortedSeasons) {
          const found = s.episodes.find((ep) => ep.id === episode.id)
          if (found) {
            req.season = s.seasonNumber
            req.episode = episode.episodeNumber
            break
          }
        }
      }
    }

    console.log(
      `[StreamSearch] ${c.title} · type=${req.type}` +
      (req.type === 'tv' ? ` S${req.season}E${req.episode}` : '') +
      ` | IMDB=${req.imdbId ?? 'none'} TMDB=${req.tmdbId ?? 'none'}`
    )

    // Correlate this search with its background source-collection event so the
    // late-arriving mirrors are merged into THIS playback only.
    const searchId = crypto.randomUUID()

    try {
      // Defense-in-depth: the main process already hard-caps the provider race, but
      // guard the IPC round-trip too so the loading overlay can never hang forever.
      const result = await Promise.race([
        providersApi.getFirstStream(req, searchId),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Timed out searching for a stream')), 50000)
        ),
      ])
      if (cancelled || !mountedRef.current) return

      if (result && result.streams.length > 0) {
        const releaseType = result.streams[0]!.qualityInfo?.releaseType
        if ((releaseType === 'cam' || releaseType === 'telesync') && !window.confirm(t('player.camWarning'))) {
          setAutoStreamState({ loading: false })
          return
        }
        // Surface the winning provider in the console — if the wrong episode plays, the
        // user can identify which provider returned bad content and disable it in
        // Settings → Providers. (The provider's embed page sometimes ignores the
        // season/episode URL params; nothing we send from this side can prevent that.)
        console.log(
          `[Stream] Source: ${result.providerName} (${result.providerId}) · ` +
          (req.type === 'tv' ? `S${req.season}E${req.episode}` : 'Movie') +
          ` · ${result.streams[0]!.url.slice(0, 100)}…`
        )
        if (result.allStreams) {
          console.log(`[Stream] ${result.allStreams.length} alternative source(s) collected for switching`)
        }
        setAutoStreamState({ loading: false })
        navigate(`/player/${c.id}${episode ? `/${episode.id}` : ''}`, {
          state: {
            streamUrl: result.streams[0]!.url,
            streamHeaders: result.streams[0]!.headers,
            providerId: result.providerId,
            allStreams: result.allStreams || [],
            sourceStatuses: result.sourceStatuses || [],
            resumeAtSeconds,
            searchId,
          },
        })
      } else {
        setAutoStreamState({
          loading: false,
          episode,
          seasonNumber,
          resumeAtSeconds,
          error: 'No working stream found. The content may be unavailable or all providers are down.',
        })
      }
    } catch (err) {
      if (cancelled || !mountedRef.current) return
      setAutoStreamState({
        loading: false,
        episode,
        seasonNumber,
        resumeAtSeconds,
        error: `Automatic search failed: ${String(err)}`,
      })
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!content) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center text-white/50">
          {t('detail.notFound')}
        </div>
      </AppLayout>
    )
  }

  const season: Season | undefined = sortedSeasons[selectedSeason] || sortedSeasons[0]
  const sortedEpisodes = season?.episodes
    ? [...season.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
    : []
  const similarItems = (similarData?.data ?? []) as ContentSummary[]

  // Find the most-recently-watched in-progress item for this content
  const resumeItem = (() => {
    const items = (continueWatchingData as any)?.data ?? []
    if (!Array.isArray(items) || items.length === 0) return null
    const matching = items
      .filter((item: any) => item.contentId === id)
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return (matching[0] as { contentId: string; episodeId: string | null; positionSeconds: number; durationSeconds: number; updatedAt: string } | undefined) ?? null
  })()

  // For series: find the season and episode object that correspond to the resume item
  const resumeEpisodeInfo = (() => {
    if (!resumeItem?.episodeId || !content) return null
    for (const s of sortedSeasons) {
      const ep = s.episodes.find((e) => e.id === resumeItem.episodeId)
      if (ep) return { episode: ep, season: s }
    }
    return null
  })()

  function fmtSecs(secs: number): string {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const thumbnail = content.backdropUrl ?? content.s3Thumbnail

  return (
    <AppLayout transparentNav>
      <section className="km-hero km-detail-hero">
        {thumbnail ? <ResponsiveArtwork key={thumbnail} src={sanitizeUrl(thumbnail)} className="km-detail-artwork km-hero-artwork" /> : <div className="km-detail-artwork km-detail-artwork-fallback" />}
        <div className="km-detail-shade" />

        {/* Back button — overlays the top-left of the backdrop */}
        <button
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="km-detail-back"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
          </svg>
          {t('common.back')}
        </button>

        <div className="km-hero-copy km-detail-copy km-catalog-gutter">
          <h1 className="km-hero-title font-bold tracking-tight text-white mb-4">{content.title}</h1>

          <div className="flex flex-wrap items-center gap-3 mb-5 text-sm text-white/75">
            {content.releaseYear && <span>{content.releaseYear}</span>}
            {content.imdbScore && (
              <span className="text-yellow-400 font-medium">★ {parseFloat(content.imdbScore).toFixed(1)}</span>
            )}
            {content.rating && (
              <span className="border border-white/40 px-1.5 py-0.5 rounded">{content.rating}</span>
            )}
            {content.type === 'movie' && content.durationMins && (
              <span>{Math.floor(content.durationMins / 60)}h {content.durationMins % 60}m</span>
            )}
            {content.type === 'series' && sortedSeasons.length > 0 && (
              <span>{t('detail.seasonCount', { count: sortedSeasons.length })}</span>
            )}
          </div>

          {content.genres.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {content.genres.map((g) => (
                <span key={g.id} className="bg-white/10 text-white/70 text-xs px-2 py-0.5 rounded-full">
                  {g.name}
                </span>
              ))}
            </div>
          )}

          {content.description && <p className="km-detail-synopsis">{content.description}</p>}
          {/* Action Buttons */}
          <div className="km-detail-actions">
            <button
              onClick={() => handleAutoStream(
                content.type === 'series' ? sortedEpisodes[0] : undefined,
                content.type === 'series' ? season?.seasonNumber : undefined,
              )}
              className="flex items-center gap-2 bg-white text-black font-semibold px-6 py-3 rounded-full hover:bg-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-accent focus-visible:ring-offset-2 focus-visible:ring-offset-km-bg"
            >
              <span>▶</span> {t('detail.watchNow')}
            </button>

            {/* Keep Watching — only shown when there is saved progress (5–95% watched) */}
            {resumeItem && (
              <button
                onClick={() => {
                  if (resumeEpisodeInfo) {
                    handleAutoStream(resumeEpisodeInfo.episode, resumeEpisodeInfo.season.seasonNumber, resumeItem.positionSeconds)
                  } else {
                    handleAutoStreamRef.current(undefined, undefined, resumeItem.positionSeconds)
                  }
                }}
                className="flex items-center gap-2 bg-km-accent text-white font-semibold px-6 py-3 rounded-full hover:bg-km-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>▶</span>
                <span>
                  {t('detail.keepWatching')}
                  {resumeEpisodeInfo
                    ? ` · S${resumeEpisodeInfo.season.seasonNumber}E${resumeEpisodeInfo.episode.episodeNumber} · ${fmtSecs(resumeItem.positionSeconds)}`
                    : ` · ${fmtSecs(resumeItem.positionSeconds)}`}
                </span>
              </button>
            )}


            <button
              onClick={() => inWatchlist ? removeMutation.mutate() : addMutation.mutate()}
              disabled={addMutation.isPending || removeMutation.isPending}
              className={`flex items-center gap-2 font-semibold px-5 py-3 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-accent disabled:opacity-50 ${
                inWatchlist
                  ? 'bg-white/20 border-white/40 text-white hover:bg-white/30'
                  : 'bg-transparent border-white/40 text-white hover:bg-white/10'
              }`}
            >
              {inWatchlist ? `✓ ${t('detail.inMyList')}` : `+ ${t('history.myList')}`}
            </button>

            {/* 3-dots Actions Dropdown next to + My List */}
            {content && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                  aria-label={t('detail.options')}
                  aria-haspopup="menu"
                  aria-expanded={showActionsDropdown}
                  className="flex items-center justify-center w-12 h-12 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-accent bg-white/[0.03] hover:bg-white/10 border border-white/20 text-white transition-all duration-200 active:scale-95"
                  title={t('detail.options')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white/70 hover:text-white transition-colors">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </button>

                {showActionsDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowActionsDropdown(false)}
                    />
                    <div role="menu" className="absolute left-0 mt-2 w-48 rounded bg-km-surface-2/95 backdrop-blur-md border border-white/10 shadow-2xl z-20 overflow-hidden py-1">
                      {content.type === 'movie' ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowActionsDropdown(false)
                            openDownloadPicker({ kind: "movie" })
                          }}
                          disabled={downloading || downloadDone}
                          className="w-full text-left px-4 py-3 text-sm font-medium text-white/80 hover:bg-violet-600/30 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          <span>{downloadDone ? '✓' : '⬇'}</span>
                          <span>{downloadDone ? t('detail.queued') : downloading ? t('detail.queuing') : t('common.download')}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setShowActionsDropdown(false)
                            openDownloadPicker({ kind: "series" })
                          }}
                          disabled={downloading || downloadDone}
                          className="w-full text-left px-4 py-3 text-sm font-medium text-white/80 hover:bg-violet-600/30 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          <span>{downloadDone ? '✓' : '⬇'}</span>
                          <span>{downloadDone ? t('detail.queued') : downloading ? t('detail.queuingAll') : t('detail.downloadAllSeasons')}</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </section>
      <div className="km-detail-sections km-catalog-gutter">
        {content.type === 'series' && sortedSeasons.length > 0 && (
          <section className="km-detail-episodes" aria-label={t('detail.episodes')}>
            <h3 className="text-white font-semibold mb-3">{t('detail.episodes')}</h3>
            <SeasonTabs seasons={sortedSeasons} selectedIndex={selectedSeason} onSelect={selectedIndex => {
              setSelectedSeason(selectedIndex)
              prefetchSeason(selectedIndex - 1)
              prefetchSeason(selectedIndex + 1)
            }} />
            <div key={`${content.id}-${season?.seasonNumber}-${sortedEpisodes.length ? 'ready' : 'loading'}`} id={`season-panel-${content.id}-${season?.id}`} role="tabpanel" aria-label={t('detail.season', { number: season?.seasonNumber })} className={'km-episode-grid' + (sortedEpisodes.length ? ' km-data-enter' : '')} data-ready={sortedEpisodes.length > 0} data-season-number={season?.seasonNumber} aria-busy={isSeasonLoading && sortedEpisodes.length === 0}>
              {isSeasonLoading && sortedEpisodes.length === 0 && <div className="km-episode-loading" role="status" aria-label={t('common.loading')}><div className="w-6 h-6 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" /></div>}
              {sortedEpisodes.map(ep => <EpisodeCard key={ep.id} episode={ep}
                onPlay={() => handleAutoStream(ep, season?.seasonNumber)}
                onDownload={() => openDownloadPicker({ kind: 'episode', episode: ep, seasonNumber: season?.seasonNumber })}
                downloadState={episodeDownloadDoneMap[ep.id] ? 'queued' : episodeDownloadingMap[ep.id] ? 'pending' : 'idle'}
                progressPercent={resumeItem?.episodeId === ep.id && resumeItem.durationSeconds > 0 ? resumeItem.positionSeconds / resumeItem.durationSeconds * 100 : undefined}
              />)}
            </div>
          </section>
        )}

          {content.cast.length > 0 && (
            <div className="mb-8">
              <h3 className="text-white/40 text-xs uppercase tracking-widest mb-3">{t('detail.cast')}</h3>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {content.cast.slice(0, 10).map((c) => (
                  <div key={c.id} className="text-sm">
                    <span className="text-white">{c.name}</span>
                    {c.role && <span className="text-white/40"> {t('detail.asRole', { role: c.role })}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

      </div>

      {/* More Like This */}
      {similarItems.length > 0 && (
        <ContentRow title={t('detail.moreLikeThis')} items={similarItems} />
      )}

      {downloadPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#120d24] p-5 shadow-2xl">
            <h2 className="text-white text-lg font-semibold mb-1">{t('detail.chooseDownloadSource')}</h2>
            <p className="text-white/45 text-xs mb-4">{t('detail.bestStreamDescription')}</p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {[{ id: "best", name: "Best Stream · 1080p Auto", enabled: true }, ...downloadProviders].map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => {
                    const target = downloadPicker
                    setDownloadPicker(null)
                    if (target.kind === "movie") handleDownload(provider.id)
                    else if (target.kind === "series") handleSeriesDownload(provider.id)
                    else if (target.episode) handleEpisodeDownload(target.episode, target.seasonNumber, provider.id)
                  }}
                  className="w-full flex items-center justify-between rounded-xl bg-white/5 hover:bg-violet-600/25 border border-white/5 px-4 py-3 text-left transition-colors"
                >
                  <span className="text-white/85 text-sm font-medium">{provider.name}</span>
                  <span className="text-violet-300 text-xs">{t('common.download')}</span>
                </button>
              ))}
              {downloadTorrentsLoading && (
                <div className="px-4 py-3 text-xs text-white/45">{t('detail.findingTorrentLanguages')}</div>
              )}
              {downloadTorrents.length > 0 && (
                <div className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">{t('detail.chooseTorrentLanguage')}</div>
              )}
              {downloadTorrents.map((torrent) => (
                <button
                  key={torrent.id}
                  onClick={() => {
                    const target = downloadPicker
                    setDownloadPicker(null)
                    if (target.kind === "movie") handleDownload(torrent.id)
                    else if (target.episode) handleEpisodeDownload(target.episode, target.seasonNumber, torrent.id)
                  }}
                  className="w-full flex items-center justify-between rounded-xl bg-emerald-500/5 hover:bg-emerald-500/15 border border-emerald-400/10 px-4 py-3 text-left transition-colors"
                >
                  <span className="text-white/85 text-sm font-medium pr-3">{torrent.name}</span>
                  <span className="text-emerald-300 text-xs flex-shrink-0">{t('common.download')}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setDownloadPicker(null)} className="mt-4 w-full rounded-xl border border-white/10 py-2 text-xs font-semibold text-white/55 hover:text-white hover:bg-white/5 transition-colors">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* Auto Stream Loading & Error Overlay */}
      {(autoStreamState.loading || autoStreamState.error) && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md">
          <div className="flex flex-col items-center max-w-sm text-center px-6">
            {autoStreamState.loading ? (
              <>
                <div className="relative w-16 h-16 mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-white/10" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-km-accent animate-spin" />
                </div>
                
                <h2 className="text-white font-semibold text-xl mb-6">{t('player.findingStream')}</h2>
                
                <button
                  onClick={() => {
                    cancelAutoStreamRef.current?.()
                    setAutoStreamState({ loading: false })
                  }}
                  className="px-6 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/10 text-xs transition-colors"
                >
                  {t('player.cancelSearch')}
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mb-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 text-2xl font-bold">
                  !
                </div>
                
                <h2 className="text-white font-semibold text-xl mb-3">{t('player.noStream')}</h2>
                <p className="text-white/60 text-sm mb-6 leading-relaxed">
                  {autoStreamState.error}
                </p>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (autoStreamState.isDownload) {
                        setAutoStreamState({ loading: false })
                        if (autoStreamState.episode) {
                          handleEpisodeDownload(autoStreamState.episode, autoStreamState.seasonNumber)
                        } else if (content.type === 'series') {
                          handleSeriesDownload()
                        } else {
                          handleDownload()
                        }
                      } else {
                        handleAutoStream(autoStreamState.episode, autoStreamState.seasonNumber, autoStreamState.resumeAtSeconds)
                      }
                    }}
                    className="px-6 py-2 rounded-full bg-white text-black font-semibold hover:bg-white/90 text-xs transition-colors"
                  >
                    {t('player.retrySearch')}
                  </button>
                  <button
                    onClick={() => setAutoStreamState({ loading: false })}
                    className="px-6 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/10 text-xs transition-colors"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
