import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ContentSummary } from '../../api/catalog'
import { useTranslation } from 'react-i18next'

interface Props {
  content: ContentSummary
  size?: 'sm' | 'md' | 'lg'
  variant?: 'poster' | 'landscape'
  /** When provided, shows a hover "remove" (×) button — used by the resume row. */
  onRemove?: (id: string) => void
}

export function ContentCard({ content, size = 'md', variant = 'poster', onRemove }: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [imgError, setImgError] = useState(false)

  const widths = { sm: 'w-32 max-w-full', md: 'w-40 max-w-full', lg: 'w-48 max-w-full' }
  // Literal classes keep every public variant in Tailwind's production output.
  const variants = { poster: 'km-content-card--poster', landscape: 'km-content-card--landscape' }
  const sizes = { sm: 'km-content-card--sm', md: 'km-content-card--md', lg: 'km-content-card--lg' }
  const artwork = variant === 'landscape' ? content.backdropUrl || content.s3Thumbnail : content.s3Thumbnail
  const cw = content as ContentSummary & { positionSeconds?: number; durationSeconds?: number; episodeId?: string | null }
  const hasProgress = cw.positionSeconds !== undefined && cw.durationSeconds !== undefined && cw.durationSeconds > 0
  const progressPercent = hasProgress ? (cw.positionSeconds! / cw.durationSeconds!) * 100 : 0

  const go = () => {
    const navState: any = {}
    if (content.tmdbId) {
      navState.tmdbId = content.tmdbId
      navState.tmdbType = content.type === 'series' ? 'tv' : 'movie'
    }
    if (cw.positionSeconds !== undefined) {
      navState.resumePosition = cw.positionSeconds
    }
    if (cw.episodeId !== undefined) {
      navState.resumeEpisodeId = cw.episodeId
    }

    navigate(`/content/${content.id}`, {
      state: Object.keys(navState).length > 0 ? navState : undefined,
    })
  }

  return (
    <div
      className={`km-content-card ${variants[variant]} ${sizes[size]} ${variant === 'poster' ? widths[size] : ''} flex-shrink-0 group relative`}
    >
      <button
        type="button"
        aria-label={content.title}
        title={t('catalog.moreInfo')}
        onClick={go}
        className="block w-full text-left cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-km-bg"
      >
      {/* Poster */}
      <div className="km-card-artwork relative w-full aspect-[2/3] overflow-hidden bg-km-surface-2 border mb-2 transition-all group-hover:border-violet-500/50">
        {artwork && !imgError ? (
          <img
            src={artwork}
            alt=""
            className="km-card-image w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3">
            <svg className="w-8 h-8 text-purple-300/20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <p className="text-purple-300/40 text-xs text-center leading-tight line-clamp-3">{content.title}</p>
          </div>
        )}

        {/* Hover overlay */}
        <div className="km-card-overlay absolute inset-0 bg-black/0 group-hover:bg-km-bg/60 group-focus-within:bg-km-bg/60 transition-all flex items-center justify-center">
          <div className="w-10 h-10 bg-km-accent flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 scale-95 group-hover:scale-100 group-focus-within:scale-100 motion-reduce:transform-none transition-all shadow-lg text-white">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 10h2v7h-2zm0-3h2v2h-2z" /><path fillRule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 100 16 8 8 0 000-16z" />
            </svg>
          </div>
        </div>

        {/* Resume progress bar */}
        {hasProgress && (
          <div className="km-card-progress absolute bottom-0 left-0 right-0 h-1 bg-white/20" role="progressbar" aria-label={content.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, progressPercent))}>
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        )}
      </div>

      {/* Title + meta */}
      <p className="text-purple-100 text-sm font-semibold line-clamp-2 min-h-10 group-hover:text-violet-400 transition-colors leading-tight">
        {content.title}
      </p>
      <p className="text-purple-200/65 text-xs mt-1 font-medium">{[content.releaseYear, content.type === 'movie' ? t('common.movie') : t('common.series'), content.imdbScore ? `★ ${content.imdbScore}` : null].filter(Boolean).join(' · ')}</p>
      </button>

      {/* Separate sibling action prevents nested interactive controls. */}
      {onRemove && (
        <button
          type="button"
          aria-label={t('catalog.removeContinue')}
          title={t('catalog.removeContinue')}
          onClick={() => onRemove(content.id)}
          className="absolute top-1.5 right-1.5 z-20 w-6 h-6 flex items-center justify-center rounded-full bg-black/70 text-white/90 border border-white/15 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-red-500/80 hover:border-red-400/40 hover:scale-110 transition-all duration-200 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}
