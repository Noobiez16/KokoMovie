import { useState, useEffect } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'
import { catalogApi, type ContentSummary } from '../api/catalog'
import { recommendationApi } from '../api/recommendation'
import { playbackApi } from '../api/playback'
import { AppLayout } from '../components/layout/AppLayout'
import { HeroBanner } from '../components/catalog/HeroBanner'
import { ContentRow } from '../components/catalog/ContentRow'
import { ContentCard } from '../components/catalog/ContentCard'
import { CatalogFallbackBanner } from '../components/catalog/CatalogFallbackBanner'
import { ApiKeyRequired } from '../components/catalog/ApiKeyRequired'

export function BrowsePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const genre = searchParams.get('genre') || undefined
  const [page, setPage] = useState(1)

  const { isAuthenticated, activeProfile } = useAuthStore()
  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey)
  const tmdbKeyHydrated = useSettingsStore((s) => s.tmdbKeyHydrated)

  useEffect(() => {
    setPage(1)
  }, [genre])

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!activeProfile) return <Navigate to="/profiles" replace />
  if (tmdbKeyHydrated && !tmdbApiKey) return <ApiKeyRequired />

  const profileId = activeProfile.id

  const { data, isLoading, isError } = useQuery({
    queryKey: ['home', profileId, tmdbApiKey],
    queryFn: () => catalogApi.getHome({}, profileId),
    staleTime: 5 * 60 * 1000,
    enabled: !genre,
  })

  const { data: genreData, isLoading: isGenreLoading, isError: isGenreError } = useQuery({
    queryKey: ['browse-genre', profileId, genre, page, tmdbApiKey],
    queryFn: () => catalogApi.browse({ genre, limit: 40, page }, profileId),
    staleTime: 5 * 60 * 1000,
    enabled: !!genre,
  })

  const { data: recData } = useQuery({
    queryKey: ['recommendations', profileId],
    queryFn: () => recommendationApi.getHomeRows(profileId),
    staleTime: 2 * 60 * 1000,
    enabled: !genre,
  })

  const { data: cwData } = useQuery({
    queryKey: ['continue-watching', profileId],
    queryFn: () => playbackApi.getContinueWatching(profileId),
    refetchOnWindowFocus: 'always',
    enabled: !genre,
  })

  if (genre) {
    if (isGenreLoading) {
      return (
        <AppLayout>
          <div className="min-h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-purple-500/10 border-t-km-accent rounded-full animate-spin" />
          </div>
        </AppLayout>
      )
    }

    if (isGenreError) {
      return (
        <AppLayout>
          <div className="min-h-screen flex items-center justify-center text-purple-300/40 text-sm">
            Could not reach catalog service.
          </div>
        </AppLayout>
      )
    }

    const items = [...new Map((genreData?.data ?? []).map((i) => [i.id, i])).values()]
    const totalPages = genreData?.meta?.pagination?.pages ?? 1
    const genreTitle = genre.charAt(0).toUpperCase() + genre.slice(1).replace('-', ' ')

    return (
      <AppLayout>
        <div className="px-8 py-8 animate-fade-in">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/browse')}
                className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-purple-300 hover:text-white transition-all active:scale-95"
                title="Back to Home"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest leading-none">Home Row Category</span>
                <h1 className="text-2xl font-bold text-white mt-1 leading-none">{genreTitle}</h1>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-sm text-purple-300/50">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/10 hover:bg-purple-500/20 hover:border-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-purple-300"
                >
                  ‹ Prev
                </button>
                <span className="font-medium">{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/10 hover:bg-purple-500/20 hover:border-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-purple-300"
                >
                  Next ›
                </button>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="text-purple-300/40 py-32 text-center text-sm">No items found in this category.</div>
          ) : (
            <div className="grid gap-x-4 gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {items.map((item) => (
                <ContentCard key={item.id} content={item} size="md" />
              ))}
            </div>
          )}
        </div>
      </AppLayout>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-km-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-purple-500/10 border-t-km-accent rounded-full animate-spin" />
          <p className="text-purple-300/40 text-sm font-medium tracking-wide">Loading...</p>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center text-purple-300/40 text-sm">
          Could not reach catalog service.
        </div>
      </AppLayout>
    )
  }

  const homeData = data?.data
  const recRows = recData?.data ?? []
  const trending: ContentSummary[] = homeData?.trending ?? []
  const featured = homeData?.featured as import('../api/catalog').ContentDetail | null | undefined

  const cwItems = cwData?.data ?? []
  const mappedCw = cwItems.map((item) => ({
    id: item.contentId,
    title: item.title,
    type: item.type,
    releaseYear: item.releaseYear,
    s3Thumbnail: item.s3Thumbnail,
    backdropUrl: item.backdropUrl,
    rating: null,
    imdbScore: null,
    durationMins: null,
    imdbId: null,
    tmdbId: null,
    planMinimum: 'basic',
    positionSeconds: item.positionSeconds,
    durationSeconds: item.durationSeconds,
    episodeId: item.episodeId,
  })) as unknown as ContentSummary[]

  const hasContent = featured || trending.length > 0 || (homeData?.rows?.length ?? 0) > 0

  if (!hasContent) {
    return (
      <AppLayout>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-km-surface-2 border border-km-border/35 flex items-center justify-center mb-2 shadow-lg">
            <svg className="w-8 h-8 text-purple-400/40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M6 20.25h12m-7.5-3v3m-4.875-3h16.5a1.125 1.125 0 000-2.25H3.375a1.125 1.125 0 000 2.25zm.375-12.375h15.75" />
            </svg>
          </div>
          <h2 className="text-white font-bold text-lg">No content yet</h2>
          <p className="text-purple-300/40 text-sm max-w-sm leading-relaxed">
            Add your TMDB API key to <code className="text-purple-200 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/10">.env</code> and restart to see movies and TV shows.
          </p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout transparentNav>
      {featured && <HeroBanner content={featured} />}

      <CatalogFallbackBanner source={data?.meta?.source} />

      <div className="pt-6 pb-12 animate-fade-in">
        {mappedCw.length > 0 && (
          <ContentRow
            title="Continue Watching"
            items={mappedCw}
          />
        )}

        {trending.length > 0 && (
          <ContentRow
            title="Trending Now"
            items={trending}
            onViewAll={() => navigate('/browse?genre=trending')}
          />
        )}

        {recRows.map((row) => (
          <ContentRow
            key={row.id}
            title={row.title}
            items={row.items as ContentSummary[]}
          />
        ))}

        {homeData?.rows?.map((row) => (
          <ContentRow
            key={row.genre.id}
            title={row.genre.name}
            items={row.items}
            onViewAll={() => navigate(`/browse?genre=${row.genre.slug}`)}
          />
        ))}
      </div>
    </AppLayout>
  )
}
