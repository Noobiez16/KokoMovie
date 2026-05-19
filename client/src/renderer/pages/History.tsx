import { Navigate, useNavigate } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { userApi, type HistoryItem } from '../api/user'
import { AppLayout } from '../components/layout/AppLayout'

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function HistoryPage() {
  const { isAuthenticated, activeProfile } = useAuthStore()
  const navigate = useNavigate()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!activeProfile) return <Navigate to="/profiles" replace />

  const profileId = activeProfile.id

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: ['history', profileId],
    queryFn: ({ pageParam }) =>
      userApi.getHistory(profileId, 50, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta?.nextCursor ?? undefined,
    staleTime: 60 * 1000,
  })

  const items: HistoryItem[] = data?.pages.flatMap((p) => p.data) ?? []

  return (
    <AppLayout>
      <div className="px-6 py-8">
        <h1 className="text-white text-2xl font-bold mb-6">Viewing History</h1>

        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
          </div>
        )}

        {isError && (
          <p className="text-white/40 text-center py-16">Failed to load history. Is the user service running?</p>
        )}

        {!isLoading && items.length === 0 && (
          <div className="text-center text-white/20 py-16">
            <p className="text-5xl mb-4">📺</p>
            <p>You haven't watched anything yet.</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-2 max-w-2xl">
            {items.map((item) => {
              const pct = item.durationSeconds > 0
                ? Math.round((item.positionSeconds / item.durationSeconds) * 100)
                : 0
              return (
                <div
                  key={item.watchedAt + item.contentId}
                  className="flex items-center gap-4 bg-km-card rounded-lg p-3 cursor-pointer hover:bg-white/10 transition-colors group"
                  onClick={() => navigate(`/content/${item.contentId}`)}
                >
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt={item.contentTitle} className="w-24 h-14 object-cover rounded flex-shrink-0" />
                  ) : (
                    <div className="w-24 h-14 bg-white/5 rounded flex-shrink-0 flex items-center justify-center">
                      <span className="text-white/20 text-xl">▶</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{item.contentTitle}</p>
                    <p className="text-white/40 text-xs mt-0.5">{formatDate(item.watchedAt)}</p>
                    {item.durationSeconds > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 max-w-32 h-0.5 bg-white/10 rounded overflow-hidden">
                          <div className="h-full bg-km-accent" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-white/30 text-xs">{pct}%</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 text-right">
                    {item.completedAt && (
                      <span className="text-green-400/70 text-xs block mb-1">Completed</span>
                    )}
                    {item.durationSeconds > 0 && (
                      <span className="text-white/30 text-xs">{formatDuration(item.durationSeconds)}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {hasNextPage && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="bg-km-card border border-white/20 text-white/70 hover:text-white px-6 py-2.5 rounded text-sm transition-colors disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
