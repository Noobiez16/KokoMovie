import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { downloadsApi, type DownloadItem } from '../api/downloads'
import { AppLayout } from '../components/layout/AppLayout'
import { applyDownloadProgress } from '../lib/download-progress'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued',
  paused: 'Paused',
  downloading: 'Downloading',
  completed: 'Downloaded',
  cancelled: 'Cancelled',
  error: 'Error',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-400',
  paused: 'text-amber-300',
  downloading: 'text-blue-400',
  completed: 'text-green-400',
  cancelled: 'text-white/40',
  error: 'text-red-400',
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0.00 MB"
  const unit = bytes >= 1024 ** 3 ? "GB" : "MB"
  const divisor = unit === "GB" ? 1024 ** 3 : 1024 ** 2
  return `${(bytes / divisor).toFixed(2)} ${unit}`
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (86400 * 1000))
}

export function DownloadsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<DownloadItem[]>([])
  const [loading, setLoading] = useState(true)


  useEffect(() => {
    const refresh = () => downloadsApi.list().then((list) => {
      setItems(list)
      setLoading(false)
    })

    void refresh()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const poll = window.setInterval(refreshWhenVisible, 5000)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    const unsub = window.electronAPI?.onDownloadProgress(({ id, percent, status, completedSegments, totalSegments, downloadedBytes, totalBytes }) => {
      setItems((previous) => applyDownloadProgress(previous, { id, percent, status, completedSegments, totalSegments, downloadedBytes, totalBytes }))
    })

    return () => {
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      unsub?.()
    }
  }, [])

  async function handleDelete(id: string) {
    await downloadsApi.delete(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function handleCancel(id: string) {
    await downloadsApi.cancel(id)
    setItems((previous) => previous.map((item) =>
      item.id === id ? { ...item, status: 'cancelled' as const } : item))
  }

  async function handlePause(id: string) {
    const result = await downloadsApi.pause(id)
    if (result.ok) setItems((previous) => previous.map((item) =>
      item.id === id ? { ...item, status: 'paused' as const } : item))
  }

  async function handleResume(id: string) {
    const result = await downloadsApi.resume(id)
    if (result.ok) setItems((previous) => previous.map((item) =>
      item.id === id ? { ...item, status: 'pending' as const } : item))
  }

  async function handlePlay(item: DownloadItem) {
    if (item.episode_id) {
      navigate(`/player/${item.content_id}/${item.episode_id}?offline=${item.id}`)
    } else {
      navigate(`/player/${item.content_id}?offline=${item.id}`)
    }
  }

  const { active, completed, other } = useMemo(() => ({
    active: items.filter((i) => i.status === 'pending' || i.status === 'downloading' || i.status === 'paused'),
    completed: items.filter((i) => i.status === 'completed'),
    other: items.filter((i) => i.status === 'cancelled' || i.status === 'error'),
  }), [items])

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Downloads</h1>
          <button onClick={() => downloadsApi.openFolder()} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-xs font-semibold transition-colors">Open Downloads Folder</button>
        </div>

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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {active.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onOpenFolder={() => downloadsApi.openFolder(item.id)}
                  onPause={item.can_pause ? () => handlePause(item.id) : undefined}                  onResume={item.status === 'paused' ? () => handleResume(item.id) : undefined}
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
                  onOpenFolder={() => downloadsApi.openFolder(item.id)}
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {other.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onOpenFolder={() => downloadsApi.openFolder(item.id)}
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
  onPause,
  onResume,
  onDelete,
  onOpenFolder,
}: {
  item: DownloadItem
  onPlay?: () => void
  onCancel?: () => void
  onPause?: () => void
  onResume?: () => void
  onDelete?: () => void
  onOpenFolder?: () => void
}) {
  const days = daysUntil(item.expires_at)

  return (
    <div className="bg-white/[0.03] backdrop-blur-md rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-white/[0.08] hover:shadow-violet-500/5 group flex flex-col justify-between">
      <div>
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt={item.title} className="w-full aspect-video object-cover transition-transform duration-500 group-hover:scale-103" />
        ) : (
          <div className="w-full aspect-video bg-white/5 flex items-center justify-center text-white/20 text-3xl">⬇</div>
        )}

        <div className="p-3">
          <p className="text-white text-sm font-medium line-clamp-2 mb-1 group-hover:text-violet-400 transition-colors">{item.title}</p>

          <p className={`text-xs font-semibold mb-2 ${STATUS_COLOR[item.status] ?? 'text-white/40'}`}>
            {STATUS_LABEL[item.status] ?? item.status}
            {item.status === 'error' && item.error_message ? ` — ${item.error_message}` : ''}
          </p>

          {(item.status === 'pending' || item.status === 'downloading' || item.status === 'paused') && (
            <div className="mb-2">
              <div className="flex justify-between text-[10px] text-white/40 mb-1">
                <span>{item.progress_percent}%</span>
                {item.total_segments > 0 && (
                  <span>{item.completed_segments}/{item.total_segments}</span>
                )}
              </div>
              <p className="text-[10px] text-white/45 mb-1 tabular-nums">{formatBytes(item.downloaded_bytes)} / {item.total_bytes > 0 ? formatBytes(item.total_bytes) : "Calculating…"}</p>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
                  style={{ width: `${item.progress_percent}%` }}
                />
              </div>
            </div>
          )}

          {item.status === 'completed' && days > 0 && (
            <p className="text-xs text-white/30 mb-2">Expires in {days}d</p>
          )}
        </div>
      </div>

      <div className="p-3 pt-0">
        <div className="flex gap-2">
          {item.status === 'completed' && onPlay && (
            <button
              onClick={onPlay}
              className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-bold py-1.5 rounded-xl shadow-md shadow-violet-600/15 transition-all duration-300 hover:scale-[1.03] active:scale-95 flex items-center justify-center gap-1"
            >
              <svg className="w-2.5 h-2.5 fill-current ml-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
          )}
          {onOpenFolder && (
            <button onClick={onOpenFolder} className="flex-1 bg-white/5 text-purple-300/60 hover:bg-white/10 hover:text-white text-xs font-bold py-1.5 rounded-xl transition-all duration-300 active:scale-95">
              Folder
            </button>
          )}
          {item.status === 'paused' && onResume && (
            <button
              onClick={onResume}
              className="flex-1 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 text-xs font-bold py-1.5 rounded-xl transition-all duration-300 active:scale-95"
            >
              Resume
            </button>
          )}
          {item.status === 'downloading' && onPause && (
            <button
              onClick={onPause}
              className="flex-1 bg-white/5 text-purple-300/60 hover:bg-white/10 hover:text-white text-xs font-bold py-1.5 rounded-xl transition-all duration-300 active:scale-95"
            >
              Pause
            </button>
          )}
          {(item.status === 'pending' || item.status === 'downloading' || item.status === 'paused') && onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 bg-white/5 text-purple-300/60 hover:bg-white/10 hover:text-white text-xs font-bold py-1.5 rounded-xl transition-all duration-300 active:scale-95"
            >
              Cancel
            </button>
          )}
          {onDelete && item.status !== 'pending' && item.status !== 'downloading' && item.status !== 'paused' && (
            <button
              onClick={onDelete}
              className="flex-1 bg-red-500/10 text-red-400/80 hover:bg-red-500/20 hover:text-red-300 text-xs font-bold py-1.5 rounded-xl transition-all duration-300 active:scale-95"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
