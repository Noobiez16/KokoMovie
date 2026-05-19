import { Navigate, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { catalogApi, type ContentSummary } from '../api/catalog'
import { recommendationApi } from '../api/recommendation'
import { AppLayout } from '../components/layout/AppLayout'
import { HeroBanner } from '../components/catalog/HeroBanner'
import { ContentRow } from '../components/catalog/ContentRow'

export function BrowsePage() {
  const navigate = useNavigate()
  const { isAuthenticated, activeProfile } = useAuthStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!activeProfile) return <Navigate to="/profiles" replace />

  const profileId = activeProfile.id

  const { data, isLoading, isError } = useQuery({
    queryKey: ['home', profileId],
    queryFn: () => catalogApi.getHome(profileId),
    staleTime: 5 * 60 * 1000,
  })

  const { data: recData } = useQuery({
    queryKey: ['recommendations', profileId],
    queryFn: () => recommendationApi.getHomeRows(profileId),
    staleTime: 2 * 60 * 1000,
  })

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
      {/* Hero banner sits behind the navbar */}
      {featured && <HeroBanner content={featured} />}

      {/* Content rows */}
      <div className="pt-6 pb-12">
        {trending.length > 0 && (
          <ContentRow
            title="Trending Now"
            items={trending}
            onViewAll={() => navigate('/browse?type=trending')}
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
          />
        ))}
      </div>
    </AppLayout>
  )
}
