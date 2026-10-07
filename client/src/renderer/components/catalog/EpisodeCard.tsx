import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Episode } from '../../api/catalog'
import { sanitizeMediaUrl } from '../../lib/media-url'

export function EpisodeCard({ episode, onPlay, onDownload, downloadState, progressPercent }: {
  episode: Episode; onPlay: () => void; onDownload: () => void;
  downloadState: 'idle' | 'pending' | 'queued'; progressPercent?: number
}) {
  const { t } = useTranslation()
  const [failedArtwork, setFailedArtwork] = useState(false)
  const artwork = episode.s3ThumbnailKey ? sanitizeMediaUrl(episode.s3ThumbnailKey) : undefined
  const downloadLabel = downloadState === 'queued' ? t('detail.queued') : downloadState === 'pending' ? t('detail.queuing') : t('common.download')
  return <article className="km-episode-card" data-episode-id={episode.id}>
    <button className="km-episode-visual" type="button" aria-label={episode.title} onClick={onPlay}>
      {artwork && !failedArtwork ? <img src={artwork} alt="" onError={() => setFailedArtwork(true)} /> : <span className="km-episode-placeholder" aria-hidden="true">▶</span>}
      <span className="km-episode-play" aria-hidden="true">▶</span>
      {progressPercent !== undefined && <span className="km-episode-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} /></span>}
    </button>
    <div className="km-episode-heading"><h4>{episode.episodeNumber}. {episode.title}</h4>
      <button className="km-episode-download" type="button" onClick={onDownload} disabled={downloadState !== 'idle'} aria-label={`${downloadLabel} · ${episode.title}`} title={downloadLabel}>{downloadState === 'queued' ? '✓' : downloadState === 'pending' ? '…' : '↓'}</button>
    </div>
    {episode.durationMins != null && <p className="km-episode-runtime">{episode.durationMins}m</p>}
    {episode.description && <p className="km-episode-description">{episode.description}</p>}
  </article>
}
