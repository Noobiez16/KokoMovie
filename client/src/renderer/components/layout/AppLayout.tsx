import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logoImg from '../../assets/logo.png'
import { Navigation } from './Navigation'
import { LibraryMenu } from './LibraryMenu'
import { Icon } from '../ui/Icon'

interface Props { children: ReactNode; transparentNav?: boolean }
export function AppLayout({ children, transparentNav = false }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const scrollRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    setScrolled((scrollRef.current?.scrollTop ?? 0) > 24)
  }, [location.pathname])
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (location.pathname === '/search') document.querySelector<HTMLInputElement>('[data-global-search]')?.focus()
        else navigate('/search', { state: { focusSearch: true } })
      }
    }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [location.pathname, navigate])
  return <div className="km-shell">
    <a href="#km-scroll-area" className="km-skip-link">{t('ui.skipContent')}</a>
    <header className="km-topbar" data-transparent={transparentNav && !scrolled}>
      <Navigation />
      <Link to="/browse" className="km-brand" aria-label="KokoMovie"><img src={logoImg} alt="" /><span>KOKOMOVIE</span></Link>
      <div className="km-header-actions">
        <Link to="/search" state={{ focusSearch: true }} aria-label={t('nav.search')} aria-current={location.pathname === '/search' ? 'page' : undefined} className="km-icon-button" onClick={() => document.querySelector<HTMLInputElement>('[data-global-search]')?.focus()}><Icon name="search" /></Link>
        <LibraryMenu />
      </div>
    </header>
    <main ref={scrollRef} id="km-scroll-area" tabIndex={-1} className="km-main" data-overlay={transparentNav} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 24)}>
      <div key={location.pathname} className="km-route-content">{children}</div>
    </main>
  </div>
}
