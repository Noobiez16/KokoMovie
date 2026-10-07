import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../ui/Icon'

export function GlobalSearch() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (location.pathname === '/search') setQuery(new URLSearchParams(location.search).get('q') ?? '')
  }, [location.pathname, location.search])
  useEffect(() => {
    if ((location.state as { focusSearch?: boolean } | null)?.focusSearch) ref.current?.focus()
  }, [location.state])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (query.trim()) {
      const params = new URLSearchParams(location.pathname === '/search' ? location.search : '')
      params.set('q', query.trim())
      params.delete('page')
      navigate('/search?' + params)
    }
  }
  const change = (value: string) => {
    setQuery(value)
    if (location.pathname === '/search') {
      const params = new URLSearchParams(location.search)
      params.set('q', value)
      params.delete('page')
      navigate('/search?' + params, { replace: true })
    }
  }
  return <form role="search" onSubmit={submit} className="km-search">
    <span className="pointer-events-none absolute left-3.5 text-purple-200/60"><Icon name="search" className="h-4 w-4" /></span>
    <input ref={ref} data-global-search type="search" aria-label={t('ui.searchLabel')} value={query} onChange={(event) => change(event.target.value)} placeholder={t('catalog.searchPlaceholder')} className="km-search-input" autoComplete="off" maxLength={200} />
    <kbd className="pointer-events-none absolute right-3 hidden rounded border border-km-border px-1.5 py-0.5 text-[10px] text-purple-200/60 xl:block">Ctrl K</kbd>
  </form>
}
