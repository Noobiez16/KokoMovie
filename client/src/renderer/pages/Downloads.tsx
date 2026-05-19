import { useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { downloadsApi, type DownloadItem } from '../api/downloads'
import { AppLayout } from '../components/layout/AppLayout'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued',
  downloading: 'Downloading',
  completed: 'Downloaded',
  cancelled: 'Cancelled',
  error: 'Error',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-400',
  downloading: 'text-blue-400',
  completed: 'text-green-400',
  cancelled: 'text-white/40',
  error: 'text-red-400',
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (86400 * 1000))
}

export function DownloadsPage() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const [items, setItems] = useState<DownloadItem[]>([])
  const [loading, setLoading] = useState(true)

  if (!isAuthenticated) return <Navigate to="/login" replace />

  useEffect(() => {
    downloadsApi.list().then((list) => {
      setItems(list)
      setLoading(false)
    })

    const unsub = window.electronAPI?.onDownloadProgress(({ id, percent }) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, progress_percent: percent, status: percent >= 100 ? 'completed' : 'downloading' } : item,
        ),
      )
    })

    return () => unsub?.()
  }, [])

  async function handleDelete(id: string) {
    await downloadsApi.delete(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function handleCancel(id: string) {
    await downloadsApi.cancel(id)
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, status: 'cancelled' } : item))
  }

  async function handlePlay(item: DownloadItem) {
    if (item.episode_id) {
      navigate(`/player/${item.content_id}/${item.episode_id}?offline=${item.id}`)
    } else {
      navigate(`/player/${item.content_id}?offline=${item.id}`)
    }
  }

  const active = items.filter((i) => i.status === 'pending' || i.status === 'downloading')
  const completed = items.filter((i) => i.status === 'completed')
  const other = items.filter((i) => i.status === 'cancelled' || i.status === 'error')

  return (
    <AppLayout>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-6">Downloads</h1>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center py-16 text-white/40">
            <div className="text-5xl mb-4">⬇</div>
            <p className="text-lg">No downloads yet</p>
            <p className="text-sm mt-2">Browse content and tap the download button to save for offline viewing.</p>
          </div>
        )}

        {active.length > 0 && (
          <section className="mb-8">
            <h2 className="text-white/60 text-xs uppercase tracking-widest mb-4">In Progress</h2>
            <div className="space-y-3">
              {active.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onCancel={() => handleCancel(item.id)}
                />
              ))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section className="mb-8">
            <h2 className="text-white/60 text-xs uppercase tracking-widest mb-4">Available Offline</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {completed.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onPlay={() => handlePlay(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </div>
          </section>
        )}

        {other.length > 0 && (
          <section>
            <h2 className="text-white/60 text-xs uppercase tracking-widest mb-4">Cancelled / Failed</h2>
            <div className="space-y-2">
              {other.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  )
}

function DownloadCard({
  item,
  onPlay,
  onCancel,
  onDelete,
}: {
  item: DownloadItem
  onPlay?: () => void
  onCancel?: () => void
  onDelete?: () => void
}) {
  const days = daysUntil(item.expires_at)

  return (
    <div className="bg-km-card rounded-lg overflow-hidden">
      {item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt={item.title} className="w-full aspect-video object-cover" />
      ) : (
        <div className="w-full aspect-video bg-white/5 flex items-center justify-center text-white/20 text-3xl">⬇</div>
      )}

      <div className="p-3">
        <p className="text-white text-sm font-medium line-clamp-2 mb-1">{item.title}</p>

        <p className={`text-xs font-medium mb-2 ${STATUS_COLOR[item.status] ?? 'text-white/40'}`}>
          {STATUS_LABEL[item.status] ?? item.status}
          {item.status === 'error' && item.error_message ? ` — ${item.error_message}` : ''}
        </p>

        {(item.status === 'pending' || item.status === 'downloading') && (
          <div className="mb-2">
            <div className="flex justify-between text-xs text-white/40 mb-1">
              <span>{item.progress_percent}%</span>
              {item.total_segments > 0 && (
                <span>{item.completed_segments}/{item.total_segments} segments</span>
              )}
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-km-accent transition-all duration-300"
                style={{ width: `${item.progress_percent}%` }}
              />
            </div>
          </div>
        )}

        {item.status === 'completed' && days > 0 && (
          <p className="text-xs text-white/30 mb-2">Expires in {days}d</p>
        )}

        <div className="flex gap-2 mt-2">
          {item.status === 'completed' && onPlay && (
            <button
              onClick={onPlay}
              className="flex-1 bg-white text-black text-xs font-semibold py-1.5 rounded hover:bg-white/90 transition-colors"
            >
              ▶ Play
            </button>
          )}
          {(item.status === 'pending' || item.status === 'downloading') && onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 border border-white/20 text-white/60 text-xs py-1.5 rounded hover:text-white hover:border-white/40 transition-colors"
            >
              Cancel
            </button>
          )}
          {onDelete && item.status !== 'pending' && item.status !== 'downloading' && (
            <button
              onClick={onDelete}
              className="flex-1 border border-red-500/30 text-red-400/70 text-xs py-1.5 rounded hover:text-red-400 hover:border-red-500/60 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
