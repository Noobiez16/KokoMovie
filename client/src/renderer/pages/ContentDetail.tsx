import { useState, useRef } from 'react'
import { useParams, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { catalogApi, type Episode, type Season } from '../api/catalog'
import { userApi } from '../api/user'
import { recommendationApi } from '../api/recommendation'
import { downloadsApi } from '../api/downloads'
import { providersApi } from '../api/providers'
import { AppLayout } from '../components/layout/AppLayout'
import { ContentRow } from '../components/catalog/ContentRow'
import type { ContentSummary } from '../api/catalog'

export function ContentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isAuthenticated, activeProfile } = useAuthStore()
  const [selectedSeason, setSelectedSeason] = useState(0)
  const [autoStreamState, setAutoStreamState] = useState<{
    loading: boolean
    episode?: Episode
    error?: string
  }>({ loading: false })

  const cancelAutoStreamRef = useRef<(() => void) | null>(null)

  const location = useLocation()
  const navState = location.state as { tmdbId?: number; tmdbType?: 'movie' | 'tv' } | null

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!activeProfile) return <Navigate to="/profiles" replace />
  if (!id) return <Navigate to="/browse" replace />

  const profileId = activeProfile.id

  const { data, isLoading, isError } = useQuery({
    queryKey: ['content', id, profileId],
    queryFn: async () => {
      // For TMDB items not yet in DB, sync first then fetch
      if (navState?.tmdbId && navState?.tmdbType) {
        try {
          await catalogApi.syncContent(navState.tmdbId, navState.tmdbType)
        } catch { /* ignore sync errors, getContent will handle */ }
      }
      return catalogApi.getContent(id, profileId)
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist-check', id, profileId],
    queryFn: () => userApi.checkWatchlist(id, profileId),
    staleTime: 30 * 1000,
  })

  const { data: similarData } = useQuery({
    queryKey: ['similar', id, profileId],
    queryFn: () => recommendationApi.getSimilar(id, profileId),
    staleTime: 5 * 60 * 1000,
  })

  const { data: providerList } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.list(),
    staleTime: 60 * 1000,
  })

  const inWatchlist = watchlistData?.data?.inWatchlist ?? false

  const addMutation = useMutation({
    mutationFn: () => userApi.addToWatchlist(id, content?.type ?? 'movie', profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist-check', id, profileId] }),
  })

  const removeMutation = useMutation({
    mutationFn: () => userApi.removeFromWatchlist(id, profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist-check', id, profileId] }),
  })

  const [downloading, setDownloading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)

  async function handleDownload() {
    const c = data?.data
    if (!c || downloading || downloadDone || !c.s3HlsKey) return
    setDownloading(true)
    try {
      await downloadsApi.start({
        contentId: c.id,
        title: c.title,
        contentType: c.type,
        thumbnailUrl: c.s3Thumbnail ?? undefined,
        durationMins: c.durationMins ?? undefined,
        manifestUrl: c.s3HlsKey,
      })
      setDownloadDone(true)
    } finally {
      setDownloading(false)
    }
  }

  async function handleAutoStream(episode?: Episode) {
    const c = data?.data
    if (!c) return

    setAutoStreamState({ loading: true, episode, error: undefined })

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
      for (const season of c.seasons) {
        const found = season.episodes.find((ep) => ep.id === episode.id)
        if (found) {
          req.season = season.seasonNumber
          req.episode = episode.episodeNumber
          break
        }
      }
    }

    try {
      const result = await providersApi.getFirstStream(req)
      if (cancelled) return

      if (result && result.streams.length > 0) {
        setAutoStreamState({ loading: false })
        navigate(`/player/${c.id}${episode ? `/${episode.id}` : ''}`, {
          state: { streamUrl: result.streams[0]!.url, streamHeaders: result.streams[0]!.headers },
        })
      } else {
        setAutoStreamState({
          loading: false,
          episode,
          error: 'No working stream found. The content may be unavailable or all providers are down.',
        })
      }
    } catch (err) {
      if (cancelled) return
      setAutoStreamState({
        loading: false,
        episode,
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

  if (isError || !data?.data) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center text-white/60">
          Content not found.
        </div>
      </AppLayout>
    )
  }

  const content = data.data
  const season: Season | undefined = content.seasons[selectedSeason]
  const similarItems = (similarData?.data ?? []) as ContentSummary[]
  const enabledProviders = (providerList ?? []).filter((p) => p.enabled)

  const thumbnail = content.backdropUrl ?? content.s3Thumbnail

  return (
    <AppLayout>
      {/* Backdrop */}
      <div className="relative">
        {thumbnail ? (
          <div className="relative h-[45vh] overflow-hidden">
            <img src={thumbnail} alt={content.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-km-bg/60 to-km-bg" />
          </div>
        ) : (
          <div className="h-16" />
        )}

        <div className={thumbnail ? 'px-8 -mt-24 relative z-10' : 'px-8 pt-8'}>
          <h1 className="text-4xl font-bold text-white mb-3">{content.title}</h1>

          <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-white/60">
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
            {content.type === 'series' && content.seasons.length > 0 && (
              <span>{content.seasons.length} Season{content.seasons.length !== 1 ? 's' : ''}</span>
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

          {/* Action Buttons */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => handleAutoStream(
                content.type === 'series' ? season?.episodes[0] : undefined
              )}
              className="flex items-center gap-2 bg-white text-black font-semibold px-8 py-3 rounded hover:bg-white/90 active:scale-95 transition-all"
            >
              <span>▶</span> Watch Now
            </button>


            <button
              onClick={() => inWatchlist ? removeMutation.mutate() : addMutation.mutate()}
              disabled={addMutation.isPending || removeMutation.isPending}
              className={`flex items-center gap-2 font-semibold px-6 py-3 rounded border transition-colors disabled:opacity-50 ${
                inWatchlist
                  ? 'bg-white/20 border-white/40 text-white hover:bg-white/30'
                  : 'bg-transparent border-white/40 text-white hover:bg-white/10'
              }`}
            >
              {inWatchlist ? '✓ In My List' : '+ My List'}
            </button>

            {content.s3HlsKey && (
              <button
                onClick={handleDownload}
                disabled={downloading || downloadDone}
                className="flex items-center gap-2 font-semibold px-6 py-3 rounded border border-white/40 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {downloadDone ? '✓ Queued' : downloading ? '...' : '⬇ Download'}
              </button>
            )}
          </div>

          {content.description && (
            <p className="text-white/70 text-sm leading-relaxed max-w-2xl mb-8">{content.description}</p>
          )}

          {content.cast.length > 0 && (
            <div className="mb-8">
              <h3 className="text-white/40 text-xs uppercase tracking-widest mb-3">Cast</h3>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {content.cast.slice(0, 10).map((c) => (
                  <div key={c.id} className="text-sm">
                    <span className="text-white">{c.name}</span>
                    {c.role && <span className="text-white/40"> as {c.role}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Series — seasons & episodes */}
          {content.type === 'series' && content.seasons.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <h3 className="text-white font-semibold">Episodes</h3>
                {content.seasons.length > 1 && (
                  <select
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(Number(e.target.value))}
                    className="bg-km-surface-2 border border-km-border text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
                  >
                    {content.seasons.map((s, i) => {
                      const isRedundant = s.title && s.title.toLowerCase().trim() === `season ${s.seasonNumber}`;
                      const titleSuffix = s.title && !isRedundant ? ` — ${s.title}` : '';
                      return (
                        <option key={s.id} value={i} className="bg-[#1b1333] text-white">
                          Season {s.seasonNumber}{titleSuffix}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              <div className="space-y-2 max-w-3xl">
                {season?.episodes.map((ep) => (
                  <div
                    key={ep.id}
                    className="flex items-center gap-4 bg-km-card rounded-lg p-3 cursor-pointer hover:bg-white/10 transition-colors group"
                    onClick={() => handleAutoStream(ep)}
                  >
                    <div className="w-8 text-center text-white/40 text-sm font-medium flex-shrink-0">
                      {ep.episodeNumber}
                    </div>
                    {ep.s3ThumbnailKey ? (
                      <img src={ep.s3ThumbnailKey} alt={ep.title} className="w-24 h-14 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-24 h-14 bg-white/5 rounded flex-shrink-0 flex items-center justify-center">
                        <span className="text-white/20 text-2xl">▶</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm">{ep.title}</p>
                      {ep.description && (
                        <p className="text-white/50 text-xs mt-0.5 line-clamp-2">{ep.description}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {ep.durationMins && <span className="text-white/40 text-xs">{ep.durationMins}m</span>}
                    </div>
                    <span className="text-white/20 group-hover:text-white/60 transition-colors">▶</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* More Like This */}
      {similarItems.length > 0 && (
        <ContentRow title="More Like This" items={similarItems} />
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
                
                <h2 className="text-white font-semibold text-xl mb-6">Finding Best Stream</h2>
                
                <button
                  onClick={() => {
                    cancelAutoStreamRef.current?.()
                    setAutoStreamState({ loading: false })
                  }}
                  className="px-6 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/10 text-xs transition-colors"
                >
                  Cancel Search
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mb-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 text-2xl font-bold">
                  !
                </div>
                
                <h2 className="text-white font-semibold text-xl mb-3">No Stream Found</h2>
                <p className="text-white/60 text-sm mb-6 leading-relaxed">
                  {autoStreamState.error}
                </p>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAutoStream(autoStreamState.episode)}
                    className="px-6 py-2 rounded-full bg-white text-black font-semibold hover:bg-white/90 text-xs transition-colors"
                  >
                    Retry Search
                  </button>
                  <button
                    onClick={() => setAutoStreamState({ loading: false })}
                    className="px-6 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/10 text-xs transition-colors"
                  >
                    Close
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
