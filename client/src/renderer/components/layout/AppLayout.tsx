import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logoImg from '../../assets/logo.png'
import { Navigation } from './Navigation'
import { LibraryMenu } from './LibraryMenu'
import { HeaderSearch } from './HeaderSearch'

interface Props { children: ReactNode; transparentNav?: boolean }
export function AppLayout({ children, transparentNav = false }: Props) {
  const { t } = useTranslation()
  const location = useLocation()
  const scrollRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    setScrolled((scrollRef.current?.scrollTop ?? 0) > 24)
  }, [location.pathname])
  return <div className="km-shell">
    <a href="#km-scroll-area" className="km-skip-link">{t('ui.skipContent')}</a>
    <header className="km-topbar" data-transparent={transparentNav && !scrolled}>
      <Navigation />
      <Link to="/browse" className="km-brand" aria-label="KokoMovie"><img src={logoImg} alt="" /><span>KOKOMOVIE</span></Link>
      <div className="km-header-actions">
        <HeaderSearch key={location.key} />
        <LibraryMenu />
      </div>
    </header>
    <main ref={scrollRef} id="km-scroll-area" tabIndex={-1} className="km-main" data-overlay={transparentNav} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 24)}>
      <div key={location.pathname} className="km-route-content">{children}</div>
    </main>
  </div>
}
