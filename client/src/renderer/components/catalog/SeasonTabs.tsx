import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Season } from '../../api/catalog'

export function SeasonTabs({ seasons, selectedIndex, onSelect }: { seasons: Season[]; selectedIndex: number; onSelect: (index: number) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  if (!seasons.length) return null
  function select(index: number) {
    onSelect(index)
    tabs.current[index]?.focus()
    tabs.current[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }
  return <div className="km-season-tabs" role="tablist" aria-label={t('detail.episodes')}>
    {seasons.map((season, index) => {
      const redundant = season.title?.toLowerCase().trim() === `season ${season.seasonNumber}`
      return <button key={season.id} ref={element => { tabs.current[index] = element }} type="button" role="tab"
        id={`${id}-${season.id}`} aria-controls={`season-panel-${season.contentId}-${season.id}`} aria-selected={index === selectedIndex} tabIndex={index === selectedIndex ? 0 : -1}
        onClick={() => select(index)} onKeyDown={event => {
          let next: number
          if (event.key === 'ArrowRight') next = (index + 1) % seasons.length
          else if (event.key === 'ArrowLeft') next = (index + seasons.length - 1) % seasons.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = seasons.length - 1
          else return
          event.preventDefault()
          select(next)
        }}>
        {t('detail.season', { number: season.seasonNumber })}{season.title && !redundant ? ` — ${season.title}` : ''}
      </button>
    })}
  </div>
}
