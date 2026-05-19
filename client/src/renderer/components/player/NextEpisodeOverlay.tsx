import { useState, useEffect } from 'react'
import type { Episode } from '../../api/catalog'

interface Props {
  nextEpisode: Episode
  onPlay: () => void
  onDismiss: () => void
  autoplayDelaySecs?: number
}

export function NextEpisodeOverlay({ nextEpisode, onPlay, onDismiss, autoplayDelaySecs = 10 }: Props) {
  const [remaining, setRemaining] = useState(autoplayDelaySecs)

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onPlay()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [onPlay])

  return (
    <div className="absolute bottom-24 right-6 z-20 bg-black/80 border border-white/20 rounded-lg p-4 w-72 backdrop-blur-sm">
      <p className="text-white/60 text-xs mb-2">Next Episode</p>
      <p className="text-white font-medium text-sm mb-3 line-clamp-2">{nextEpisode.title}</p>

      <div className="flex gap-2">
        <button
          onClick={onPlay}
          className="flex-1 bg-km-accent text-black font-semibold text-sm py-2 rounded hover:bg-km-accent/90 transition-colors"
        >
          ▶ Play ({remaining}s)
        </button>
        <button
          onClick={onDismiss}
          className="bg-white/10 text-white/70 text-sm px-3 py-2 rounded hover:bg-white/20 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/20 rounded-full mt-3">
        <div
          className="h-full bg-km-accent rounded-full transition-all duration-1000"
          style={{ width: `${((autoplayDelaySecs - remaining) / autoplayDelaySecs) * 100}%` }}
        />
      </div>
    </div>
  )
}
