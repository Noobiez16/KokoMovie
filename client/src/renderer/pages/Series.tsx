import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSettingsStore } from '../store/settings'
import { catalogApi } from '../api/catalog'
import { AppLayout } from '../components/layout/AppLayout'
import { HeroBanner } from '../components/catalog/HeroBanner'
import { ContentRow } from '../components/catalog/ContentRow'
import { ContentCard } from '../components/catalog/ContentCard'
import { CatalogFallbackBanner } from '../components/catalog/CatalogFallbackBanner'
import { CategoryPagination, scrollCatalogToTop } from '../components/catalog/CategoryPagination'
import { ApiKeyRequired } from '../components/catalog/ApiKeyRequired'

export function SeriesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const genre = searchParams.get('genre') || undefined
  const [page, setPage] = useState(1)

  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey)
  const tmdbKeyHydrated = useSettingsStore((s) => s.tmdbKeyHydrated)

  useEffect(() => {
    setPage(1)
  }, [genre])

  const goToPage = (next: number) => {
    setPage(next)
    scrollCatalogToTop()
  }


  const profileId = 'local'

  const { data: homeData, isLoading: isHomeLoading, isError: isHomeError } = useQuery({
    queryKey: ['series-home', profileId, tmdbApiKey],
    queryFn: () => catalogApi.getHome({ type: 'series' }, profileId),
    staleTime: 5 * 60 * 1000,
    enabled: !genre,
  })

  const { data: genreData, isLoading: isGenreLoading, isError: isGenreError } = useQuery({
    queryKey: ['series-genre', profileId, genre, page, tmdbApiKey],
    queryFn: () => catalogApi.browse({ type: 'series', genre, limit: 80, page }, profileId),
    staleTime: 5 * 60 * 1000,
    enabled: !!genre,
  })

  if (tmdbKeyHydrated && !tmdbApiKey) return <ApiKeyRequired />

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

    const items = [...new Map((genreData?.data ?? []).map((s) => [s.id, s])).values()]
    const totalPages = genreData?.meta?.pagination?.pages ?? 1
    const genreTitle = genre.charAt(0).toUpperCase() + genre.slice(1).replace('-', ' ')

    return (
      <AppLayout>
        <div className="px-8 py-8 animate-fade-in">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/series')}
                className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-purple-300 hover:text-white transition-all active:scale-95"
                title="Back to TV Shows"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest leading-none">TV Shows Category</span>
                <h1 className="text-2xl font-bold text-white mt-1 leading-none">{genreTitle}</h1>
              </div>
            </div>

            {totalPages > 1 && (
              <span className="text-sm text-purple-300/50 font-medium">Page {page} / {totalPages}</span>
            )}
          </div>

          {items.length === 0 ? (
            <div className="text-purple-300/40 py-32 text-center text-sm">No series found in this category.</div>
          ) : (
            <>
              <div className="grid gap-x-4 gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
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
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-purple-500/10 border-t-km-accent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (isHomeError) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center text-purple-300/40 text-sm">
          Could not reach catalog service.
        </div>
      </AppLayout>
    )
  }

  const seriesData = homeData?.data
  const featured = seriesData?.featured as any | null
  const trending = seriesData?.trending ?? []
  const rows = seriesData?.rows ?? []

  return (
    <AppLayout transparentNav>
      {featured && <HeroBanner content={featured} />}

      <CatalogFallbackBanner source={homeData?.meta?.source} />

      <div className="pt-6 pb-12 animate-fade-in">
        {trending.length > 0 && (
          <ContentRow
            title="Trending TV Shows"
            items={trending}
            onViewAll={() => navigate('/series?genre=trending')}
          />
        )}

        {rows.map((row) => (
          <ContentRow
            key={row.genre.id}
            title={row.genre.name}
            items={row.items}
            onViewAll={() => navigate(`/series?genre=${row.genre.slug}`)}
          />
        ))}

        {!featured && trending.length === 0 && rows.length === 0 && (
          <div className="text-purple-300/40 py-32 text-center text-sm">No series available yet.</div>
        )}
      </div>
    </AppLayout>
  )
}
