import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Episode } from '../../api/catalog'

interface Props {
  nextEpisode: Episode
  onPlay: () => void
  onDismiss: () => void
  autoplayDelaySecs?: number
  autoplayEnabled?: boolean
}

export function NextEpisodeOverlay({ nextEpisode, onPlay, onDismiss, autoplayDelaySecs = 10, autoplayEnabled = true }: Props) {
  const { t } = useTranslation()
  const [remaining, setRemaining] = useState(autoplayDelaySecs)
  const onPlayRef = useRef(onPlay)

  useEffect(() => {
    onPlayRef.current = onPlay
  }, [onPlay])

  useEffect(() => {
    setRemaining(autoplayDelaySecs)
    if (!autoplayEnabled) return
    let next = autoplayDelaySecs
    const timer = setInterval(() => {
      next = Math.max(0, next - 1)
      setRemaining(next)
      if (next === 0) {
        clearInterval(timer)
        onPlayRef.current()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [autoplayDelaySecs, autoplayEnabled, nextEpisode.id])

  return (
    <div className="absolute bottom-24 right-6 z-20 bg-black/80 border border-white/20 rounded-lg p-4 w-72 backdrop-blur-sm">
      <p className="text-white/60 text-xs mb-2">{t('player.nextEpisode')}</p>
      <p className="text-white font-medium text-sm mb-3 line-clamp-2">{nextEpisode.title}</p>

      <div className="flex gap-2">
        <button
          onClick={onPlay}
          className="flex-1 bg-km-accent text-black font-semibold text-sm py-2 rounded hover:bg-km-accent/90 transition-colors"
        >
          ▶ {t('common.play')}{autoplayEnabled ? ` (${remaining}s)` : ''}
        </button>
        <button
          onClick={onDismiss}
          aria-label={t('common.close')}
          title={t('common.close')}
          className="bg-white/10 text-white/70 text-sm px-3 py-2 rounded hover:bg-white/20 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      {autoplayEnabled && <div className="h-0.5 bg-white/20 rounded-full mt-3">
        <div
          className="h-full bg-km-accent rounded-full transition-all duration-1000"
          style={{ width: `${((autoplayDelaySecs - remaining) / autoplayDelaySecs) * 100}%` }}
        />
      </div>}
    </div>
  )
}
