import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logoImg from '../../assets/logo.png'
import { Navigation } from './Navigation'
import { GlobalSearch } from './GlobalSearch'
import { Icon } from '../ui/Icon'

interface Props { children: ReactNode; transparentNav?: boolean }

const NAVIGATION_SIZE_KEY = 'kokomovie.navigation.compact'
function navigationPreference(): boolean | null {
  try {
    const saved = localStorage.getItem(NAVIGATION_SIZE_KEY)
    return saved === 'true' ? true : saved === 'false' ? false : null
  } catch { return null }
}

export function AppLayout({ children, transparentNav = false }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [compact, setCompact] = useState(() => navigationPreference() ?? (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1100px)').matches))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 1100px)')
    const adapt = () => { if (navigationPreference() === null) setCompact(media.matches) }
    media.addEventListener('change', adapt)
    return () => media.removeEventListener('change', adapt)
  }, [])
  const toggleNavigation = () => {
    const next = !compact
    setCompact(next)
    try { localStorage.setItem(NAVIGATION_SIZE_KEY, String(next)) } catch { /* The layout still works without persistent storage. */ }
  }
  return (
    <div className="flex h-screen overflow-hidden bg-km-bg text-[var(--km-text)]">
      <a href="#km-scroll-area" className="km-skip-link">{t('ui.skipContent')}</a>
      <aside className="km-sidebar" data-compact={compact} aria-label={t('ui.mainNavigation')}>
        <Link to="/browse" className="km-brand" aria-label="KokoMovie">
          <img src={logoImg} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-lg shadow-violet-500/20" />
          <span className="km-nav-label font-black tracking-wider text-violet-200">KOKOMOVIE</span>
        </Link>
        <Navigation />
        <div className="km-sidebar-footer">
          <button type="button" className="km-nav-link" onClick={toggleNavigation} aria-label={t(compact ? 'ui.expandNavigation' : 'ui.collapseNavigation')} aria-expanded={!compact}>
            <Icon name="panel" /><span className="km-nav-label">{t(compact ? 'ui.expandNavigation' : 'ui.collapseNavigation')}</span>
          </button>
          <p className="km-nav-label px-3 pt-3 text-xs text-purple-200/60">{t('ui.localLibrary')}</p>
        </div>
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className={'km-header ' + (transparentNav ? 'bg-km-bg/90' : 'bg-km-surface/80')}>
          <button type="button" onClick={() => navigate(-1)} aria-label={t('common.back')} className="km-icon-button shrink-0"><Icon name="back" /></button>
          <GlobalSearch />
          <Link to="/downloads" className="km-icon-button ml-auto shrink-0" aria-label={t('nav.downloads')}><Icon name="download" /></Link>
        </header>
        <main id="km-scroll-area" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">{children}</main>
      </div>
    </div>
  )
}
