import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
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
  const [activeTab, setActiveTab] = useState<'all' | 'in-progress' | 'completed' | 'list'>('all')

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

  const { data: watchlistData, isLoading: isWatchlistLoading, isError: isWatchlistError } = useQuery({
    queryKey: ['watchlist', profileId],
    queryFn: () => userApi.getWatchlist(profileId),
    enabled: activeTab === 'list' && !!profileId,
    staleTime: 30 * 1000,
  })

  const watchlistItems = watchlistData?.data ?? []

  const items: HistoryItem[] = data?.pages.flatMap((p) => p.data) ?? []

  const filteredItems = items.filter((item) => {
    const pct = item.durationSeconds > 0
      ? (item.positionSeconds / item.durationSeconds) * 100
      : 0
    const isCompleted = item.completedAt !== null || pct >= 90

    if (activeTab === 'completed') return isCompleted
    if (activeTab === 'in-progress') return item.positionSeconds > 0 && !isCompleted
    return true
  })

  const handleItemClick = (item: HistoryItem, forceResume = false) => {
    const pct = item.durationSeconds > 0
      ? (item.positionSeconds / item.durationSeconds) * 100
      : 0
    const isCompleted = item.completedAt !== null || pct >= 90

    const navState: any = {}
    if (!isCompleted || forceResume) {
      if (item.positionSeconds > 0) {
        navState.resumePosition = item.positionSeconds
      }
      if (item.episodeId) {
        navState.resumeEpisodeId = item.episodeId
      }
    }

    navigate(`/content/${item.contentId}`, {
      state: Object.keys(navState).length > 0 ? navState : undefined,
    })
  }

  return (
    <AppLayout>
      <div className="px-6 py-8">
        <h1 className="text-white text-2xl font-bold mb-6">Viewing History</h1>

        {/* Glassmorphic Tabs */}
        <div className="flex gap-2 mb-6">
          {(['all', 'in-progress', 'completed', 'list'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                activeTab === tab
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/25'
                  : 'bg-white/5 text-purple-300/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tab === 'in-progress' ? 'In Progress' : tab === 'completed' ? 'Completed' : tab === 'list' ? 'List' : 'All'}
            </button>
          ))}
        </div>

        {activeTab !== 'list' ? (
          <>
            {isLoading && (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
              </div>
            )}

            {isError && (
              <p className="text-white/40 text-center py-16">Failed to load history. Is the user service running?</p>
            )}

            {!isLoading && filteredItems.length === 0 && (
              <div className="text-center text-white/20 py-16 bg-white/[0.02] backdrop-blur-md rounded-2xl max-w-2xl">
                <p className="text-5xl mb-4">📺</p>
                <p className="text-sm font-medium">No items found in this section.</p>
              </div>
            )}

            {filteredItems.length > 0 && (
              <div className="space-y-2 max-w-2xl">
                {filteredItems.map((item) => {
                  const pct = item.durationSeconds > 0
                    ? Math.round((item.positionSeconds / item.durationSeconds) * 100)
                    : 0
                  const isCompleted = item.completedAt !== null || pct >= 90

                  return (
                    <div
                      key={item.watchedAt + item.contentId}
                      className="flex items-center gap-4 bg-white/[0.03] backdrop-blur-md rounded-xl p-3 cursor-pointer hover:bg-white/[0.08] transition-all hover:scale-[1.01] hover:shadow-lg hover:shadow-violet-950/20 duration-300 shadow-sm"
                      onClick={() => handleItemClick(item)}
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

                      <div className="flex-shrink-0 flex flex-col items-end gap-2 text-right">
                        {isCompleted ? (
                          <span className="text-green-400/70 text-xs font-semibold px-2 py-0.5 rounded-lg bg-green-500/10">Completed</span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleItemClick(item, true)
                            }}
                            className="flex items-center gap-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold px-3 py-1 rounded-xl transition-all duration-300 text-[10px] shadow-md shadow-violet-600/15 hover:scale-105 active:scale-95"
                          >
                            <svg className="w-2.5 h-2.5 fill-current ml-0.5" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            Continue
                          </button>
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
                  className="bg-white/5 text-white/70 hover:text-white px-6 py-2.5 rounded-xl text-sm transition-all hover:bg-white/10 disabled:opacity-50"
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {isWatchlistLoading && (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
              </div>
            )}

            {isWatchlistError && (
              <p className="text-white/40 text-center py-16">Failed to load watchlist. Is the user service running?</p>
            )}

            {!isWatchlistLoading && !isWatchlistError && watchlistItems.length === 0 && (
              <div className="text-center text-white/20 py-16 bg-white/[0.02] backdrop-blur-md rounded-2xl max-w-2xl">
                <p className="text-5xl mb-4">⭐</p>
                <p className="text-sm font-medium">Your list is empty.</p>
              </div>
            )}

            {!isWatchlistLoading && !isWatchlistError && watchlistItems.length > 0 && (
              <div className="space-y-2 max-w-2xl">
                {watchlistItems.map((item) => (
                  <div
                    key={item.contentId}
                    className="flex items-center gap-4 bg-white/[0.03] backdrop-blur-md rounded-xl p-3 cursor-pointer hover:bg-white/[0.08] transition-all hover:scale-[1.01] hover:shadow-lg hover:shadow-violet-950/20 duration-300 shadow-sm"
                    onClick={() => navigate(`/content/${item.contentId}`)}
                  >
                    {item.s3Thumbnail ? (
                      <img src={item.s3Thumbnail} alt={item.title} className="w-24 h-14 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-24 h-14 bg-white/5 rounded flex-shrink-0 flex items-center justify-center">
                        <span className="text-white/20 text-xl">▶</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{item.title || 'Unknown Title'}</p>
                      <p className="text-white/40 text-xs mt-0.5">Added {formatDate(item.addedAt)}</p>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2 pr-2">
                      <span className="text-purple-300/40 text-xs uppercase tracking-wider font-semibold">{item.contentType}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
