import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ContentSummary } from '../../api/catalog'

interface Props {
  content: ContentSummary
  size?: 'sm' | 'md' | 'lg'
}

export function ContentCard({ content, size = 'md' }: Props) {
  const navigate = useNavigate()
  const [imgError, setImgError] = useState(false)

  const widths = { sm: 'w-28', md: 'w-36', lg: 'w-48' }
  const cw = content as any
  const hasProgress = cw.positionSeconds !== undefined && cw.durationSeconds !== undefined && cw.durationSeconds > 0
  const progressPercent = hasProgress ? (cw.positionSeconds / cw.durationSeconds) * 100 : 0

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
      className={`${widths[size]} flex-shrink-0 cursor-pointer group`}
      onClick={go}
    >
      {/* Poster */}
      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-km-surface-2 border border-km-border/30 mb-2 shadow-md transition-all duration-300 group-hover:border-violet-500/50 group-hover:shadow-violet-500/10">
        {content.s3Thumbnail && !imgError ? (
          <img
            src={content.s3Thumbnail}
            alt={content.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
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
        <div className="absolute inset-0 bg-black/0 group-hover:bg-violet-950/45 transition-all duration-300 flex items-center justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300 shadow-lg text-white">
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Type badge */}
        <div className="absolute top-1.5 left-1.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
            content.type === 'movie' ? 'bg-violet-600/80 text-white' : 'bg-fuchsia-600/80 text-white'
          }`}>
            {content.type === 'movie' ? 'Movie' : 'Series'}
          </span>
        </div>

        {/* Score badge */}
        {content.imdbScore && parseFloat(content.imdbScore) >= 7 && (
          <div className="absolute top-1.5 right-1.5 bg-black/75 rounded-md px-1.5 py-0.5 flex items-center gap-0.5 backdrop-blur-sm">
            <span className="text-yellow-400 text-[10px]">★</span>
            <span className="text-white text-[10px] font-semibold">{parseFloat(content.imdbScore).toFixed(1)}</span>
          </div>
        )}

        {/* Progress Bar for Continue Watching */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        )}
      </div>

      {/* Title + meta */}
      <p className="text-purple-100/90 text-xs font-semibold truncate group-hover:text-violet-400 transition-colors leading-tight">
        {content.title}
      </p>
      <p className="text-purple-300/40 text-[10px] mt-0.5 font-medium">{content.releaseYear}</p>
    </div>
  )
}
