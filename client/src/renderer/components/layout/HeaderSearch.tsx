import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
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
  const [disclosure, setDisclosure] = useState<{ state: 'closed' | 'open' | 'closing'; session: number }>({ state: 'closed', session: 0 })
  const open = disclosure.state === 'open'
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const legacy = location.pathname === '/search'
  const openSearch = useCallback(() => {
    setDisclosure(previous => previous.state === 'open' ? previous : { state: 'open', session: previous.session + 1 })
  }, [])
  const close = useCallback((restoreFocus = false) => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setDisclosure(previous => previous.state === 'open' ? { ...previous, state: reduced ? 'closed' : 'closing' } : previous)
    if (restoreFocus) trigger.current?.focus()
  }, [])
  useEffect(() => {
    if (disclosure.state !== 'closing') return
    // Keep this fallback aligned with --km-motion-menu-close (160ms).
    const timer = setTimeout(() => setDisclosure(previous => previous.state === 'closing' ? { ...previous, state: 'closed' } : previous), 160)
    return () => clearTimeout(timer)
  }, [disclosure.state])
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (legacy) document.querySelector<HTMLInputElement>('[data-global-search]')?.focus()
        else { openSearch(); input.current?.focus() }
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [legacy, openSearch])
  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, close])
  if (legacy) return null
  return <div ref={container} className="km-header-search" data-open={open}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close() }}
    onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true) } }}>
    <button ref={trigger} type="button" className="km-icon-button" aria-label={t('nav.search')} aria-expanded={open} aria-controls={open ? `${id}-disclosure` : undefined}
      onClick={() => { if (open) close(true); else openSearch() }}><Icon name="search" /></button>
    {disclosure.state !== 'closed' && <SearchSuggestions key={disclosure.session} enabled={open} inputRef={input} id={id} close={close} />}
  </div>
}

function SearchSuggestions({ enabled, inputRef, id, close }: { enabled: boolean; inputRef: React.RefObject<HTMLInputElement | null>; id: string; close: () => void }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const tmdbApiKey = useSettingsStore(state => state.tmdbApiKey)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(-1)
  const normalized = query.trim()
  const preferences = useQuery({ queryKey: ['preferences', 'local'], queryFn: () => userApi.getPreferences('local'), enabled, staleTime: 0 })
  const maturity = preferences.data?.data.maturityRating
  useEffect(() => {
    if (!enabled) return
    const timer = setTimeout(() => setDebounced(normalized), 300)
    return () => clearTimeout(timer)
  }, [normalized, enabled])
  const ready = enabled && normalized.length >= 2 && normalized === debounced && preferences.isSuccess && !preferences.isFetching
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
    if (!enabled) return
    close()
    navigate(`/content/${item.id}`, { state: item.tmdbId ? { tmdbId: item.tmdbId, tmdbType: item.type === 'series' ? 'tv' : 'movie' } : undefined })
  }
  const keyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!enabled) return
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
  const showPanel = normalized.length >= 2
  return <div id={`${id}-disclosure`} className="km-header-search-expanded" data-closing={!enabled} aria-hidden={!enabled || undefined} inert={!enabled || undefined}>
    <input ref={inputRef} data-header-search type="search" role="combobox" aria-label={t('ui.searchLabel')} aria-autocomplete="list"
      aria-expanded={items.length > 0} aria-controls={showPanel ? id : undefined} aria-activedescendant={items[active] ? `${id}-${active}` : undefined}
      aria-describedby={showPanel ? `${id}-status` : undefined} value={query} autoComplete="off" maxLength={200} placeholder={t('catalog.searchPlaceholder')} disabled={!enabled}
      onChange={event => { if (enabled) { setQuery(event.target.value); setActive(-1) } }} onKeyDown={keyboard} className="km-header-search-input" />
    {showPanel && <div className="km-header-search-panel">
      <p id={`${id}-status`} role="status" className="km-header-search-status">
        {error ? t('catalog.serviceError') : busy ? t('common.loading') : items.length ? t('ui.searchSuggestions') : t('catalog.noResultsFor', { query: normalized })}
      </p>
      {error && <button type="button" className="km-button-secondary" disabled={!enabled} onClick={() => { if (enabled) void (preferences.isError ? preferences.refetch() : search.refetch()) }}>{t('common.retry')}</button>}
      <ul id={id} role="listbox" aria-label={t('ui.searchSuggestions')}>
        {items.map((item, index) => <li key={item.id} id={`${id}-${index}`} role="option" aria-selected={active === index}
          className="km-header-search-result" onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => select(item)}>
          <span className="km-header-search-poster">{item.s3Thumbnail && <img src={item.s3Thumbnail} alt="" onError={event => { event.currentTarget.style.visibility = 'hidden' }} />}</span>
          <span><strong>{item.title}</strong><small>{[item.releaseYear, item.type === 'movie' ? t('common.movie') : t('common.series'), item.imdbScore ? `★ ${item.imdbScore}` : null].filter(Boolean).join(' · ')}</small></span>
        </li>)}
      </ul>
    </div>}
  </div>
}
