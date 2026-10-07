import { genreLabel } from '../components/catalog/genreLabel'
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../store/settings'
import { catalogApi } from '../api/catalog'
import { AppLayout } from '../components/layout/AppLayout'
import { HeroBanner } from '../components/catalog/HeroBanner'
import { ContentRow } from '../components/catalog/ContentRow'
import { GenreNavigation } from '../components/catalog/GenreNavigation'
import { ContentCard } from '../components/catalog/ContentCard'
import { CatalogFallbackBanner } from '../components/catalog/CatalogFallbackBanner'
import { CategoryPagination, scrollCatalogToTop } from '../components/catalog/CategoryPagination'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { ApiKeyRequired } from '../components/catalog/ApiKeyRequired'

export function SeriesPage() {
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

  const { data: homeData, isLoading: isHomeLoading, isError: isHomeError, refetch: refetchHome } = useQuery({
    queryKey: ['series-home', profileId, tmdbApiKey],
    queryFn: () => catalogApi.getHome({ type: 'series' }, profileId),
    staleTime: 5 * 60 * 1000,
    enabled: !isCategory,
  })

  const { data: genreData, isLoading: isGenreLoading, isError: isGenreError, refetch: refetchGenre } = useQuery({
    queryKey: ['series-genre', profileId, genre, collection, page, tmdbApiKey],
    queryFn: () => catalogApi.browse({ type: 'series', genre, ...(collection ? { collection } : {}), limit: 80, page }, profileId),
    staleTime: 5 * 60 * 1000,
    enabled: isCategory,
  })

  if (tmdbKeyHydrated && !tmdbApiKey) return <ApiKeyRequired />

  if (isCategory) {
    if (isGenreLoading) {
      return (
        <AppLayout>
          <GenreNavigation type="series" />
          <div className="min-h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-purple-500/10 border-t-km-accent rounded-full animate-spin" />
          </div>
        </AppLayout>
      )
    }

    if (isGenreError) {
      return (
        <AppLayout>
          <GenreNavigation type="series" />
          <EmptyState title={t('catalog.serviceError')} action={<button className="km-button-secondary" onClick={() => void refetchGenre()}>{t('common.retry')}</button>} />
        </AppLayout>
      )
    }

    const items = [...new Map((genreData?.data ?? []).map((s) => [s.id, s])).values()]
    const totalPages = genreData?.meta?.pagination?.pages ?? 1
    const genreTitle = collection ? t('catalog.trending') : genreLabel(genre!, genre!.charAt(0).toUpperCase() + genre!.slice(1).replace('-', ' '), t)

    return (
      <AppLayout>
          <GenreNavigation type="series" />
        <div className="km-catalog-gutter py-7 animate-fade-in">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/series')}
                className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-purple-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-accent"
                title={t('catalog.backSeries')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <PageHeader title={genreTitle} eyebrow={t('catalog.seriesCategory')} />
            </div>

            {totalPages > 1 && (
              <span className="text-sm text-purple-300/50 font-medium">{t('catalog.pageLabel', { page, total: totalPages })}</span>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyState title={t('catalog.noSeries')} />
          ) : (
            <>
              <div className="grid gap-x-4 gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {items.map((show) => (
                  <ContentCard key={show.id} content={show} size="md" />
                ))}
              </div>
              <CategoryPagination page={page} totalPages={totalPages} onPageChange={goToPage} />
            </>
          )}
        </div>
      </AppLayout>
    )
  }

  if (isHomeLoading) {
    return (
      <AppLayout>
          <GenreNavigation type="series" />
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-purple-500/10 border-t-km-accent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (isHomeError) {
    return (
      <AppLayout>
          <GenreNavigation type="series" />
        <EmptyState title={t('catalog.serviceError')} action={<button className="km-button-secondary" onClick={() => void refetchHome()}>{t('common.retry')}</button>} />
      </AppLayout>
    )
  }

  const seriesData = homeData?.data
  const featured = seriesData?.featured
  const trending = seriesData?.trending ?? []
  const rows = seriesData?.rows ?? []

  return (
    <AppLayout transparentNav={!!featured}>
      {featured && <HeroBanner content={featured} />}

      <GenreNavigation type="series" />
      <CatalogFallbackBanner source={homeData?.meta?.source} />

      <div className="pt-6 pb-12 animate-fade-in">
        {trending.length > 0 && (
          <ContentRow
            title={t('catalog.trendingSeries')}
            items={trending}
            onViewAll={() => navigate('/series?collection=trending')}
          />
        )}

        {rows.map((row) => (
          <ContentRow
            key={row.genre.id}
            title={genreLabel(row.genre.slug, row.genre.name, t)}
            items={row.items}
            onViewAll={() => navigate(`/series?genre=${row.genre.slug}`)}
          />
        ))}

        {!featured && trending.length === 0 && rows.length === 0 && (
          <EmptyState title={t('catalog.noSeriesAvailable')} />
        )}
      </div>
    </AppLayout>
  )
}
