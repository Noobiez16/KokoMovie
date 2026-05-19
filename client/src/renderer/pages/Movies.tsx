import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { catalogApi } from '../api/catalog'
import { AppLayout } from '../components/layout/AppLayout'
import { ContentCard } from '../components/catalog/ContentCard'

export function MoviesPage() {
  const { isAuthenticated, activeProfile } = useAuthStore()
  const [page, setPage] = useState(1)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!activeProfile) return <Navigate to="/profiles" replace />

  const { data, isLoading, isError } = useQuery({
    queryKey: ['movies', activeProfile.id, page],
    queryFn: () => catalogApi.browse({ type: 'movie', limit: 40, page }, activeProfile.id),
    staleTime: 5 * 60 * 1000,
  })

  const movies = data?.data ?? []
  const totalPages = data?.meta?.pagination?.pages ?? 1

  return (
    <AppLayout>
      <div className="px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Movies</h1>
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

        {isLoading && (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-purple-500/10 border-t-km-accent rounded-full animate-spin" />
          </div>
        )}
        {isError && (
          <div className="text-purple-300/40 py-32 text-center text-sm">Failed to load movies.</div>
        )}
        {!isLoading && !isError && movies.length === 0 && (
          <div className="text-purple-300/40 py-32 text-center text-sm">No movies available yet.</div>
        )}

        <div className="grid gap-x-4 gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {movies.map((movie) => (
            <ContentCard key={movie.id} content={movie} size="md" />
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
