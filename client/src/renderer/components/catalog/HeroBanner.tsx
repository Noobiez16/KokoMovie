import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ContentDetail } from '../../api/catalog'

interface Props {
  content: ContentDetail
}

export function HeroBanner({ content }: Props) {
  const navigate = useNavigate()
  const [muted, setMuted] = useState(true)
  const [showTrailer, setShowTrailer] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: '100%', height: '100%' })

  const bg = content.backdropUrl ?? content.s3Thumbnail

  const go = () =>
    navigate(`/content/${content.id}`, {
      state: content.tmdbId
        ? { tmdbId: content.tmdbId, tmdbType: content.type === 'series' ? 'tv' : 'movie' }
        : undefined,
    })

  const toggleMute = () => {
    const nextMuted = !muted
    setMuted(nextMuted)
    if (iframeRef.current && iframeRef.current.contentWindow) {
      const command = nextMuted ? 'mute' : 'unMute'
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: command, args: [] }),
        '*'
      )
    }
  }

  useEffect(() => {
    setShowTrailer(false)
    if (!content.trailerKey) return
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
      const containerRatio = width / height
      const videoRatio = 16 / 9

      if (containerRatio > videoRatio) {
        // Container is wider than 16:9 - fit width, scale height up
        const targetHeight = width / videoRatio
        setDimensions({
          width: `${width}px`,
          height: `${targetHeight}px`,
        })
      } else {
        // Container is taller than 16:9 - fit height, scale width up
        const targetWidth = height * videoRatio
        setDimensions({
          width: `${targetWidth}px`,
          height: `${height}px`,
        })
      }
    }

    handleResize()
    const observer = new ResizeObserver(handleResize)
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="relative w-full h-[70vh] min-h-[460px] max-h-[700px] overflow-hidden flex-shrink-0">
      {/* Backdrop */}
      {bg ? (
        <img
          src={bg}
          alt={content.title}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 z-0 ${
            showTrailer ? 'opacity-0' : 'opacity-100'
          }`}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1b1238] to-km-bg z-0" />
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
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-[1.15] transition-opacity duration-1000"
            allow="autoplay; encrypted-media"
            title="Trailer"
          />
          {/* Transparent click/hover interception shield */}
          <div className="absolute inset-0 bg-transparent pointer-events-auto z-10" />
        </div>
      )}

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-km-bg/90 via-km-bg/40 to-transparent z-20 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-km-bg via-transparent to-black/20 z-20 pointer-events-none" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 px-8 pb-14 z-30">
        {/* Type label */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-lg border ${
            content.type === 'movie'
              ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
              : 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20'
          }`}>
            {content.type === 'movie' ? '🎬 Movie' : '📺 Series'}
          </span>
          {content.releaseYear && (
            <span className="text-purple-200/50 text-sm">{content.releaseYear}</span>
          )}
          {content.imdbScore && (
            <span className="text-yellow-400 text-sm font-medium">
              ★ {parseFloat(content.imdbScore).toFixed(1)}
            </span>
          )}
          {content.rating && (
            <span className="border border-purple-500/20 text-purple-300/60 text-xs px-1.5 py-0.5 rounded">
              {content.rating}
            </span>
          )}
          {content.type === 'movie' && content.durationMins && (
            <span className="text-purple-200/50 text-sm">
              {Math.floor(content.durationMins / 60)}h {content.durationMins % 60}m
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-black text-white mb-3 leading-tight max-w-xl drop-shadow-lg bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-purple-200">
          {content.title}
        </h1>

        {/* Description */}
        {content.description && (
          <p className="text-purple-200/75 text-sm leading-relaxed line-clamp-2 max-w-lg mb-6">
            {content.description}
          </p>
        )}

        {/* Genres */}
        {content.genres?.length > 0 && (
          <div className="flex gap-1.5 mb-5 flex-wrap">
            {content.genres.slice(0, 4).map((g) => (
              <span key={g.id} className="text-xs text-purple-300/60 bg-purple-500/10 border border-purple-500/10 px-2 py-0.5 rounded-full">
                {g.name}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={go}
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold px-7 py-2.5 rounded-xl transition-all duration-300 text-sm shadow-lg shadow-violet-600/25 active:scale-[0.98]"
          >
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </button>
          <button
            onClick={go}
            className="flex items-center gap-2 bg-white/5 border border-white/10 text-white font-semibold px-7 py-2.5 rounded-xl hover:bg-white/10 transition-all duration-300 text-sm backdrop-blur-md active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            More Info
          </button>
          <button
            onClick={toggleMute}
            className="w-10 h-10 rounded-full border border-purple-500/20 bg-purple-950/20 flex items-center justify-center text-purple-300/70 hover:text-white hover:border-purple-500/40 hover:bg-purple-950/40 transition-all ml-auto"
            title={muted ? 'Unmute' : 'Mute'}
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
          </button>
        </div>
      </div>
    </div>
  )
}
