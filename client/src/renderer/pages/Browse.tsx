import { genreLabel } from '../components/catalog/genreLabel'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../store/settings'
import { catalogApi, type ContentSummary } from '../api/catalog'
import { userApi } from '../api/user'
import { playbackApi } from '../api/playback'
import { AppLayout } from '../components/layout/AppLayout'
import { HeroBanner } from '../components/catalog/HeroBanner'
import { ContentRow } from '../components/catalog/ContentRow'
import { ContentCard } from '../components/catalog/ContentCard'
import { CatalogFallbackBanner } from '../components/catalog/CatalogFallbackBanner'
import { CategoryPagination, scrollCatalogToTop } from '../components/catalog/CategoryPagination'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { ApiKeyRequired } from '../components/catalog/ApiKeyRequired'

export function BrowsePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const legacyTrending = searchParams.get('genre') === 'trending'
  const collection = searchParams.get('collection') === 'trending' || legacyTrending ? 'trending' : undefined
  const genre = collection ? undefined : searchParams.get('genre') || undefined
  const isCategory = !!genre || !!collection

  useEffect(() => {
    if (!legacyTrending) return
    const normalized = new URLSearchParams(searchParams)
    normalized.delete('genre')
    normalized.set('collection', 'trending')
    setSearchParams(normalized, { replace: true })
  }, [legacyTrending, searchParams, setSearchParams])
  const [page, setPage] = useState(1)

  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey)
  const tmdbKeyHydrated = useSettingsStore((s) => s.tmdbKeyHydrated)

  useEffect(() => {
    setPage(1)
  }, [genre, collection])

  const goToPage = (next: number) => {
    setPage(next)
    scrollCatalogToTop()
  }


  const profileId = 'local'

  const { data, isLoading, isError, refetch: refetchHome } = useQuery({
    queryKey: ['home', profileId, tmdbApiKey],
    queryFn: () => catalogApi.getHome({}, profileId),
    staleTime: 5 * 60 * 1000,
    enabled: !isCategory,
  })

  const { data: genreData, isLoading: isGenreLoading, isError: isGenreError, refetch: refetchGenre } = useQuery({
    queryKey: ['browse-genre', profileId, genre, collection, page, tmdbApiKey],
    queryFn: () => catalogApi.browse({ genre, ...(collection ? { collection } : {}), limit: 80, page }, profileId),
    staleTime: 5 * 60 * 1000,
    enabled: isCategory,
  })

  const { data: cwData } = useQuery({
    queryKey: ['continue-watching', profileId, tmdbApiKey],
    queryFn: () => playbackApi.getContinueWatching(profileId),
    refetchOnWindowFocus: 'always',
    enabled: !isCategory,
  })

  const { data: watchlistData, isLoading: isWatchlistLoading } = useQuery({
    queryKey: ['watchlist', profileId],
    queryFn: () => userApi.getWatchlist(profileId),
    refetchOnWindowFocus: 'always',
    enabled: !isCategory,
  })

  const queryClient = useQueryClient()

  // Remove a title from the resume row: drop it from the UI immediately (optimistic), then
  // cascade-delete its in-progress records so it also leaves Viewing History's In-Progress.
  const handleRemoveFromHistory = useCallback(async (mediaId: string) => {
    const key = ['continue-watching', profileId, tmdbApiKey]
    const previous = queryClient.getQueryData(key)
    queryClient.setQueryData(key, (old: any) =>
      old?.data ? { ...old, data: old.data.filter((i: { contentId: string }) => i.contentId !== mediaId) } : old,
    )
    try {
      await playbackApi.removeFromContinueWatching(mediaId, profileId)
      queryClient.invalidateQueries({ queryKey: ['continue-watching', profileId] })
      queryClient.invalidateQueries({ queryKey: ['history'] })
    } catch {
      // Restore the row if the deletion failed.
      if (previous !== undefined) queryClient.setQueryData(key, previous)
    }
  }, [queryClient, profileId, tmdbApiKey])

  if (tmdbKeyHydrated && !tmdbApiKey) return <ApiKeyRequired />

  if (isCategory) {
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
          <EmptyState title={t('catalog.serviceError')} action={<button className="km-button-secondary" onClick={() => void refetchGenre()}>{t('common.retry')}</button>} />
        </AppLayout>
      )
    }

    const items = [...new Map((genreData?.data ?? []).map((i) => [i.id, i])).values()]
    const totalPages = genreData?.meta?.pagination?.pages ?? 1
    const genreTitle = collection ? t('catalog.trending') : genreLabel(genre!, genre!.charAt(0).toUpperCase() + genre!.slice(1).replace('-', ' '), t)

    return (
      <AppLayout>
        <div className="px-6 lg:px-10 py-7 animate-fade-in">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/browse')}
                className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-purple-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-accent"
                title={t('catalog.backHome')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <PageHeader title={genreTitle} eyebrow={t('catalog.homeCategory')} />
            </div>

            {totalPages > 1 && (
              <span className="text-sm text-purple-300/50 font-medium">{t('catalog.pageLabel', { page, total: totalPages })}</span>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyState title={t('catalog.noItems')} />
          ) : (
            <>
              <div className="grid gap-x-4 gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {items.map((item) => (
                  <ContentCard key={item.id} content={item} size="md" />
                ))}
              </div>
              <CategoryPagination page={page} totalPages={totalPages} onPageChange={goToPage} />
            </>
          )}
        </div>
      </AppLayout>
    )
  }

  if (isLoading) {
    return (
      <AppLayout><div className="min-h-[60vh] bg-km-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-purple-500/10 border-t-km-accent rounded-full animate-spin" />
          <p className="text-purple-200/65 text-sm font-medium tracking-wide">{t('common.loading')}</p>
        </div>
      </div></AppLayout>
    )
  }

  if (isError && !cwData?.data?.length && !watchlistData?.data?.length && !isWatchlistLoading) {
    return (
      <AppLayout>
        <EmptyState title={t('catalog.serviceError')} action={<button className="km-button-secondary" onClick={() => void refetchHome()}>{t('common.retry')}</button>} />
      </AppLayout>
    )
  }

  const homeData = data?.data
  const trending: ContentSummary[] = homeData?.trending ?? []
  const featured = homeData?.featured

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

  const savedItems: ContentSummary[] = (watchlistData?.data ?? []).map(item => ({
    id: item.contentId, title: item.title ?? item.contentId,
    type: item.contentType === 'series' || item.contentType === 'tv' ? 'series' : 'movie',
    releaseYear: item.releaseYear ?? null, s3Thumbnail: item.s3Thumbnail ?? null,
    backdropUrl: item.backdropUrl ?? null, rating: null, imdbScore: null,
    durationMins: null, imdbId: null, tmdbId: null, planMinimum: 'basic',
  }))

  const hasContent = savedItems.length > 0 || mappedCw.length > 0 || featured || trending.length > 0 || (homeData?.rows?.length ?? 0) > 0

  if (!hasContent) {
    return (
      <AppLayout>
        <EmptyState title={t('catalog.noContent')} description={t('catalog.addKeyInSettings')} action={<button onClick={() => navigate('/settings')} className="rounded-xl bg-km-accent px-5 py-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{t('nav.settings')}</button>} />
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
            title={t('catalog.continueWatching')}
            items={mappedCw}
            variant="landscape"
            onRemove={handleRemoveFromHistory}
          />
        )}

        {savedItems.length > 0 && <ContentRow title={t('history.myList')} items={savedItems} onViewAll={() => navigate('/history?tab=list')} />}

        {isError && <EmptyState title={t('catalog.serviceError')} action={<button className="km-button-secondary" onClick={() => void refetchHome()}>{t('common.retry')}</button>} />}

        {trending.length > 0 && (
          <ContentRow
            title={t('catalog.trending')}
            items={trending}
            onViewAll={() => navigate('/browse?collection=trending')}
          />
        )}

        {homeData?.rows?.map((row) => (
          <ContentRow
            key={row.genre.id}
            title={genreLabel(row.genre.slug, row.genre.name, t)}
            items={row.items}
            onViewAll={() => navigate(`/browse?genre=${row.genre.slug}`)}
          />
        ))}
      </div>
    </AppLayout>
  )
}
