import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ContentDetail, ContentSummary } from '../../api/catalog'
import { useTranslation } from 'react-i18next'
import { ResponsiveArtwork } from './ResponsiveArtwork'

interface Props {
  content: ContentSummary & Partial<Pick<ContentDetail, 'trailerKey' | 'genres'>>
}

export function HeroBanner({ content }: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [muted, setMuted] = useState(true)
  const [showTrailer, setShowTrailer] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: '100%', height: '100%' })

  const bg = content.backdropUrl ?? content.s3Thumbnail

  const go = (autoPlay = false) =>
    navigate(`/content/${content.id}`, {
      state: {
        ...(content.tmdbId ? { tmdbId: content.tmdbId, tmdbType: content.type === 'series' ? 'tv' : 'movie' } : {}),
        ...(autoPlay ? { autoPlay: true } : {}),
      },
    })

  const toggleMute = () => {
    const nextMuted = !muted
    setMuted(nextMuted)
    if (iframeRef.current && iframeRef.current.contentWindow) {
      const command = nextMuted ? 'mute' : 'unMute'
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: command, args: [] }),
        'https://www.youtube.com'
      )
    }
  }

  useEffect(() => {
    setShowTrailer(false)
    setMuted(true)
    if (!content.trailerKey || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = setTimeout(() => {
      setShowTrailer(true)
    }, 2000)
    return () => clearTimeout(timer)
  }, [content.trailerKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleResize = () => {
      const { width, height } = container.getBoundingClientRect()
      const videoRatio = 16 / 9
      const fittedWidth = Math.min(width, height * videoRatio)
      setDimensions({ width: `${fittedWidth}px`, height: `${fittedWidth / videoRatio}px` })
    }

    handleResize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleResize)
    observer?.observe(container)

    return () => observer?.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="km-hero relative w-full overflow-hidden flex-shrink-0">
      {/* Backdrop */}
      {bg ? (
        <ResponsiveArtwork
          key={bg}
          src={bg}
          className={`absolute inset-0 w-full h-full km-hero-artwork transition-opacity motion-reduce:transition-none z-0 ${
            showTrailer ? 'opacity-0' : 'opacity-100'
          }`}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-km-surface-2 to-km-bg z-0" />
      )}

      {/* Trailer Video */}
      {content.trailerKey && showTrailer && (
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-10">
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${content.trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${content.trailerKey}&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1&enablejsapi=1&vq=hd1080`}
            style={{
              width: dimensions.width,
              height: dimensions.height,
              right: 0,
            }}
            className="absolute top-1/2 -translate-y-1/2 transition-opacity duration-1000 motion-reduce:transition-none"
            allow="autoplay; encrypted-media"
            title={t('catalog.trailer')}
          />
          {/* Transparent click/hover interception shield */}
          <div className="absolute inset-0 bg-transparent pointer-events-auto z-10" />
        </div>
      )}

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-km-bg/90 via-km-bg/40 to-transparent z-20 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-km-bg via-transparent to-black/20 z-20 pointer-events-none" />

      {/* Content */}
      <div className="km-hero-copy relative km-catalog-gutter z-30">
        {/* Type label */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-lg border ${
            content.type === 'movie'
              ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
              : 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20'
          }`}>
            {content.type === 'movie' ? `🎬 ${t('common.movie')}` : `📺 ${t('common.series')}`}
          </span>
          {content.releaseYear && (
            <span className="text-purple-100/75 text-sm">{content.releaseYear}</span>
          )}
          {content.imdbScore && (
            <span className="text-yellow-400 text-sm font-medium">
              ★ {parseFloat(content.imdbScore).toFixed(1)}
            </span>
          )}
          {content.rating && (
            <span className="border border-purple-500/20 text-purple-100/75 text-xs px-1.5 py-0.5 rounded">
              {content.rating}
            </span>
          )}
          {content.type === 'movie' && content.durationMins && (
            <span className="text-purple-100/75 text-sm">
              {Math.floor(content.durationMins / 60)}h {content.durationMins % 60}m
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="km-hero-title font-bold tracking-tight text-white mb-3 leading-tight drop-shadow-lg bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-purple-200">
          {content.title}
        </h1>

        {/* Description */}
        {content.description && (
          <p className="text-purple-100/80 text-sm leading-relaxed line-clamp-3 max-w-lg mb-6">
            {content.description}
          </p>
        )}

        {/* Genres */}
        {content.genres && content.genres.length > 0 && (
          <div className="flex gap-1.5 mb-5 flex-wrap">
            {content.genres.slice(0, 4).map((g) => (
              <span key={g.id} className="text-xs text-purple-100/75 bg-purple-500/10 border border-purple-500/10 px-2 py-0.5 rounded-full">
                {g.name}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => go(content.type === 'movie')}
            className="flex items-center gap-2 bg-km-accent hover:bg-km-accent-hover text-white font-bold px-7 py-2.5 rounded-full transition-colors duration-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-km-bg shadow-lg shadow-violet-600/25 active:scale-[0.98]"
          >
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            {content.type === 'series' ? t('ui.viewEpisodes') : t('common.play')}
          </button>
          {content.type === 'movie' && <button
            onClick={() => go()}
            className="flex items-center gap-2 bg-white/5 border border-white/10 text-white font-semibold px-7 py-2.5 rounded-full hover:bg-white/10 transition-colors duration-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-km-bg backdrop-blur-md active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            {t('catalog.moreInfo')}
          </button>}
          {content.trailerKey && showTrailer && <button
            onClick={toggleMute}
            className="w-10 h-10 rounded-full border border-purple-500/20 bg-purple-950/20 flex items-center justify-center text-purple-300/70 hover:text-white hover:border-purple-500/40 hover:bg-purple-950/40 transition-colors ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={muted ? t('common.unmute') : t('common.mute')}
            aria-pressed={!muted}
            title={muted ? t('common.unmute') : t('common.mute')}
          >
            {muted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
                <path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-6.414-3H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>}
        </div>
      </div>
    </div>
  )
}
