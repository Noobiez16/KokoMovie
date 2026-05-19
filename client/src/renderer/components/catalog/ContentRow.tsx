import { useRef } from 'react'
import { ContentCard } from './ContentCard'
import type { ContentSummary } from '../../api/catalog'

interface Props {
  title: string
  items: ContentSummary[]
  size?: 'sm' | 'md' | 'lg'
  onViewAll?: () => void
}

export function ContentRow({ title, items, size = 'md', onViewAll }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!ref.current) return
    ref.current.scrollBy({ left: dir === 'right' ? 700 : -700, behavior: 'smooth' })
  }

  if (!items.length) return null

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3 px-8">
        <h2 className="text-white font-semibold text-base tracking-wide">{title}</h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-violet-400 text-xs font-semibold hover:text-violet-300 transition-colors flex items-center gap-1 group/btn"
          >
            See all
            <svg className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      <div className="relative group/row">
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-2 top-1/3 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-km-surface/90 border border-km-border/30 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all hover:bg-violet-900/20 hover:border-violet-500/50 hover:scale-110 text-violet-400 shadow-md backdrop-blur-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div
          ref={ref}
          className="flex gap-3 overflow-x-auto px-8 pb-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <ContentCard key={item.id} content={item} size={size} />
          ))}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-2 top-1/3 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-km-surface/90 border border-km-border/30 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all hover:bg-violet-900/20 hover:border-violet-500/50 hover:scale-110 text-violet-400 shadow-md backdrop-blur-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </section>
  )
}
