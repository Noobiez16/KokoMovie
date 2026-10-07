import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../ui/Icon'

const links = [
  ['history.myList', '/history?tab=list', 'list'],
  ['catalog.continueWatching', '/continue-watching', 'play'],
  ['nav.history', '/history', 'history'],
  ['nav.downloads', '/downloads', 'download'],
  ['nav.providers', '/providers', 'providers'],
  ['nav.settings', '/settings', 'settings'],
] as const
export function LibraryMenu() {
  const { t } = useTranslation()
  const location = useLocation()
  const id = useId()
  const container = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const close = () => {
    toggle.current?.focus()
    setOpen(false)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setClosing(!reduced)
    clearTimeout(timer.current)
    if (!reduced) timer.current = setTimeout(() => setClosing(false), 160)
  }
  useEffect(() => {
    clearTimeout(timer.current)
    setOpen(false)
    setClosing(false)
    return () => clearTimeout(timer.current)
  }, [location.key])
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close() } }
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) close() }
    document.addEventListener('keydown', escape)
    document.addEventListener('pointerdown', outside)
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside) }
  }, [open])
  const list = new URLSearchParams(location.search).get('tab') === 'list'
  const libraryActive = links.some(([, path]) => path.split('?')[0] === location.pathname)
  return <div ref={container} className="km-library-menu">
    <button ref={toggle} type="button" className={'km-icon-button ' + (libraryActive ? 'km-nav-active' : '')} aria-label={t('ui.libraryMenu')} aria-expanded={open} aria-controls={id} onClick={() => { if (open) close(); else { clearTimeout(timer.current); setClosing(false); setOpen(true) } }}>
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
    {(open || closing) && <div id={id} className="km-menu-panel" data-closing={closing} aria-hidden={closing || undefined} inert={closing || undefined}>
      <nav className="km-compact-nav" aria-label={t('ui.mainNavigation')}>
        {([['nav.home', '/browse'], ['nav.movies', '/movies'], ['nav.series', '/series']] as const).map(([label, path]) => <Link key={path} to={path} onClick={close} aria-current={location.pathname === path ? 'page' : undefined} className="km-menu-link">{t(label)}</Link>)}
      </nav>
      <p className="km-menu-heading">{t('ui.localLibrary')}</p>
      {links.map(([label, path, icon]) => {
        const pathname = path.split('?')[0]
        const active = location.pathname === pathname && (pathname !== '/history' || (path.includes('?') === list))
        return <Link key={path} to={path} onClick={close} aria-current={active ? 'page' : undefined} className={'km-menu-link ' + (active ? 'km-nav-active' : '')}><Icon name={icon} />{t(label)}</Link>
      })}
      <button type="button" className="km-menu-link" onClick={() => { close(); window.dispatchEvent(new Event('kokomovie:help')) }}><Icon name="help" />{t('ui.help')}</button>
    </div>}
  </div>
}
