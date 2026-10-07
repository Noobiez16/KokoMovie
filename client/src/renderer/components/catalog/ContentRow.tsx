import { useRef } from 'react'
import { ContentCard } from './ContentCard'
import type { ContentSummary } from '../../api/catalog'
import { useTranslation } from 'react-i18next'

interface Props {
  title: string
  items: ContentSummary[]
  size?: 'sm' | 'md' | 'lg'
  variant?: 'poster' | 'landscape'
  onViewAll?: () => void
  /** When set, each card shows a hover "remove" (×) button calling this with the item id. */
  onRemove?: (id: string) => void
}

export function ContentRow({ title, items, size = 'md', variant = 'poster', onViewAll, onRemove }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!ref.current) return
    ref.current.scrollBy({ left: (dir === 'right' ? 1 : -1) * ref.current.clientWidth * 0.85, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  if (!items.length) return null

  return (
    <section className="catalog-row km-content-row mb-10">
      <div className="flex items-center justify-between mb-4 km-catalog-gutter">
        <h2 className="text-white font-semibold text-lg tracking-tight">{title}</h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-violet-400 text-xs font-semibold hover:text-violet-300 transition-colors flex items-center gap-1 group/btn rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {t('catalog.seeAll')}
            <svg className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      <div className="relative group/row">
        {/* Left arrow */}
        <button
          type="button"
          aria-label={`${title}: ${t('common.previous')}`}
          onClick={() => scroll('left')}
          className="absolute left-2 top-1/3 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-km-surface/90 border border-km-border/30 flex items-center justify-center opacity-90 group-hover/row:opacity-100 focus-visible:opacity-100 transition-all hover:bg-violet-900/20 hover:border-violet-500/50 hover:scale-110 text-violet-400 shadow-md backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div
          ref={ref}
          className="km-row-track flex overflow-x-auto km-catalog-gutter"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <ContentCard key={item.id} content={item} size={size} variant={variant} onRemove={onRemove} />
          ))}
        </div>

        {/* Right arrow */}
        <button
          type="button"
          aria-label={`${title}: ${t('common.next')}`}
          onClick={() => scroll('right')}
          className="absolute right-2 top-1/3 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-km-surface/90 border border-km-border/30 flex items-center justify-center opacity-90 group-hover/row:opacity-100 focus-visible:opacity-100 transition-all hover:bg-violet-900/20 hover:border-violet-500/50 hover:scale-110 text-violet-400 shadow-md backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </section>
  )
}
