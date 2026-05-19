import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { catalogApi, type ContentSummary } from '../api/catalog'
import { AppLayout } from '../components/layout/AppLayout'
import { ContentCard } from '../components/catalog/ContentCard'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function SearchPage() {
  const { isAuthenticated, activeProfile } = useAuthStore()
  const location = useLocation()
  const initialQuery = new URLSearchParams(location.search).get('q') ?? ''
  const [query, setQuery] = useState(initialQuery)
  const debouncedQuery = useDebounce(query, 400)

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q') ?? ''
    setQuery(q)
  }, [location.search])

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!activeProfile) return <Navigate to="/profiles" replace />

  type SearchResult = { success: true; data: ContentSummary[]; meta: Record<string, unknown> }

  const { data, isFetching, isError } = useQuery<SearchResult>({
    queryKey: ['search', debouncedQuery, activeProfile.id],
    queryFn: () => catalogApi.search(debouncedQuery, {}, activeProfile.id) as Promise<SearchResult>,
    enabled: debouncedQuery.length >= 2,
    staleTime: 2 * 60 * 1000,
  })

  const results: ContentSummary[] = data?.data ?? []

  return (
    <AppLayout>
      <div className="px-8 py-8">
        {/* Search bar */}
        <div className="mb-8 relative max-w-2xl">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300/30" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, series, cast..."
            className="w-full bg-km-surface-2/40 border border-km-border/30 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-purple-300/30 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-base transition-all"
            autoFocus
          />
          {isFetching && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-purple-500/20 border-t-km-accent rounded-full animate-spin" />
          )}
        </div>

        {isError && debouncedQuery.length >= 2 && (
          <p className="text-purple-300/40 text-sm text-center py-8">Search failed — is the catalog service running?</p>
        )}

        {!isFetching && debouncedQuery.length >= 2 && results.length === 0 && !isError && (
          <div className="text-center py-16">
            <p className="text-purple-300/20 text-4xl mb-3">¯\_(ツ)_/¯</p>
            <p className="text-purple-300/40 text-sm">No results for "<span className="text-white font-medium">{debouncedQuery}</span>"</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <p className="text-purple-300/40 text-sm mb-6">
              {results.length} result{results.length !== 1 ? 's' : ''} for "<span className="text-white font-semibold">{debouncedQuery}</span>"
            </p>
            <div className="grid gap-x-4 gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {results.map((item) => (
                <ContentCard key={item.id} content={item} size="md" />
              ))}
            </div>
          </>
        )}

        {!debouncedQuery && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <svg className="w-12 h-12 text-purple-300/10" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-purple-300/30 text-sm font-medium">Search for movies, TV shows, or cast</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
