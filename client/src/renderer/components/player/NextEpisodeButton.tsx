import type { Episode } from '../../api/catalog'

interface Props {
  /** The episode to advance to, or null when there is no next episode (end of series). */
  nextEpisode: Episode | null
  /** Called with the next episode when the user chooses to advance. */
  onPlay: (ep: Episode) => void
  /**
   * `control` — compact icon button for the bottom controls bar (beside play/pause).
   * `credits`  — prominent labelled button shown over the end credits.
   */
  variant?: 'control' | 'credits'
  className?: string
}

// Standard "skip to next" glyph: a play triangle butted against a vertical bar.
const SkipNextIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6 5.14v13.72a1 1 0 0 0 1.52.86l9.05-6.86a1 1 0 0 0 0-1.72L7.52 4.28A1 1 0 0 0 6 5.14z" />
    <rect x="17.5" y="4.5" width="2.5" height="15" rx="1" />
  </svg>
)

/**
 * Reusable "Next Episode" affordance for the player.
 *
 * Edge cases (last episode of the series) are driven entirely by `nextEpisode`:
 * - `control` variant renders nothing when there is no next episode, so movies and final
 *   episodes simply don't show the button.
 * - `credits` variant shows a quiet end-of-series state instead of a dead button.
 *
 * The parent owns the transition logic (computing the next episode across seasons and
 * re-initialising the stream); this component is purely the presentation + click target.
 */
export function NextEpisodeButton({ nextEpisode, onPlay, variant = 'control', className = '' }: Props) {
  if (variant === 'control') {
    if (!nextEpisode) return null
    return (
      <button
        onClick={() => onPlay(nextEpisode)}
        aria-label="Next episode"
        title={`Next: ${nextEpisode.title}`}
        className={`text-white/80 hover:text-km-accent transition-colors flex items-center justify-center w-8 h-8 ${className}`}
      >
        <SkipNextIcon />
      </button>
    )
  }

  // credits variant — end-of-series state when there's nothing to advance to.
  if (!nextEpisode) {
    return (
      <div className={`bg-black/70 border border-white/15 text-white/70 text-sm px-4 py-2 rounded-lg backdrop-blur-sm ${className}`}>
        Final episode — you’re all caught up
      </div>
    )
  }

  return (
    <button
      onClick={() => onPlay(nextEpisode)}
      title={nextEpisode.title}
      className={`flex items-center gap-2 bg-km-accent text-black font-semibold px-5 py-2 rounded hover:bg-km-accent/90 transition-colors ${className}`}
    >
      <SkipNextIcon className="w-4 h-4" />
      <span className="truncate max-w-[220px]">Next Episode ›</span>
    </button>
  )
}
