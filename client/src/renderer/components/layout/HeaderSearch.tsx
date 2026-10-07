import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { catalogApi, type ContentSummary } from '../../api/catalog'
import { userApi } from '../../api/user'
import { useSettingsStore } from '../../store/settings'
import { Icon } from '../ui/Icon'

export function HeaderSearch() {
  const { t } = useTranslation()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const legacy = location.pathname === '/search'
  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (legacy) document.querySelector<HTMLInputElement>('[data-global-search]')?.focus()
        else { setOpen(true); input.current?.focus() }
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [legacy])
  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  if (legacy) return null
  return <div ref={container} className="km-header-search" data-open={open}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close() }}
    onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true) } }}>
    <button ref={trigger} type="button" className="km-icon-button" aria-label={t('nav.search')} aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) close(true); else setOpen(true) }}><Icon name="search" /></button>
    {open && <SearchSuggestions inputRef={input} id={id} close={() => close()} />}
  </div>
}

function SearchSuggestions({ inputRef, id, close }: { inputRef: React.RefObject<HTMLInputElement | null>; id: string; close: () => void }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const tmdbApiKey = useSettingsStore(state => state.tmdbApiKey)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(-1)
  const normalized = query.trim()
  const preferences = useQuery({ queryKey: ['preferences', 'local'], queryFn: () => userApi.getPreferences('local'), staleTime: 0 })
  const maturity = preferences.data?.data.maturityRating
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(normalized), 300)
    return () => clearTimeout(timer)
  }, [normalized])
  const ready = normalized.length >= 2 && normalized === debounced && preferences.isSuccess && !preferences.isFetching
  const search = useQuery({
    queryKey: ['search', 'header', debounced, 'local', tmdbApiKey, i18n?.language, maturity],
    queryFn: () => catalogApi.search(debounced, { page: 1 }, 'local'),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
    retry: false,
  })
  // A cached response belongs to this exact text, language and maturity only.
  // Also hide it during refetch, including localized-query invalidation.
  const items = ready && !search.isFetching && search.isSuccess ? search.data.data.slice(0, 8) : []
  const selectionKey = [debounced, i18n?.language, maturity, search.dataUpdatedAt].join('|')
  useEffect(() => { setActive(-1) }, [selectionKey])
  const select = (item: ContentSummary) => {
    close()
    navigate(`/content/${item.id}`, { state: item.tmdbId ? { tmdbId: item.tmdbId, tmdbType: item.type === 'series' ? 'tv' : 'movie' } : undefined })
  }
  const keyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (items.length) setActive(previous => event.key === 'ArrowDown' ? (previous + 1) % items.length : (previous <= 0 ? items.length - 1 : previous - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (items[active]) select(items[active])
    }
  }
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
  }, [active, id])
  const error = preferences.isError || (ready && !search.isFetching && search.isError)
  const busy = normalized.length >= 2 && (!ready || search.isFetching)
  return <div className="km-header-search-expanded">
    <input ref={inputRef} data-header-search type="search" role="combobox" aria-label={t('ui.searchLabel')} aria-autocomplete="list"
      aria-expanded={items.length > 0} aria-controls={id} aria-activedescendant={items[active] ? `${id}-${active}` : undefined}
      aria-describedby={`${id}-status`} value={query} autoComplete="off" maxLength={200} placeholder={t('catalog.searchPlaceholder')}
      onChange={event => { setQuery(event.target.value); setActive(-1) }} onKeyDown={keyboard} className="km-header-search-input" />
    <div className="km-header-search-panel">
      <p id={`${id}-status`} role="status" className="km-header-search-status">
        {normalized.length < 2 ? t('ui.searchMinimum') : error ? t('catalog.serviceError') : busy ? t('common.loading') : items.length ? t('ui.searchSuggestions') : t('catalog.noResultsFor', { query: normalized })}
      </p>
      {error && <button type="button" className="km-button-secondary" onClick={() => void (preferences.isError ? preferences.refetch() : search.refetch())}>{t('common.retry')}</button>}
      <ul id={id} role="listbox" aria-label={t('ui.searchSuggestions')}>
        {items.map((item, index) => <li key={item.id} id={`${id}-${index}`} role="option" aria-selected={active === index}
          className="km-header-search-result" onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => select(item)}>
          <span className="km-header-search-poster">{item.s3Thumbnail && <img src={item.s3Thumbnail} alt="" onError={event => { event.currentTarget.style.visibility = 'hidden' }} />}</span>
          <span><strong>{item.title}</strong><small>{[item.releaseYear, item.type === 'movie' ? t('common.movie') : t('common.series'), item.imdbScore ? `★ ${item.imdbScore}` : null].filter(Boolean).join(' · ')}</small></span>
        </li>)}
      </ul>
    </div>
  </div>
}
