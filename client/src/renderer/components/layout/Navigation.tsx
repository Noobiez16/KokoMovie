import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../ui/Icon'

const groups = [
  { label: 'nav.discover', links: [
    { label: 'nav.home', path: '/browse', icon: 'home' },
    { label: 'nav.movies', path: '/movies', icon: 'movie' },
    { label: 'nav.series', path: '/series', icon: 'series' },
    { label: 'nav.search', path: '/search', icon: 'search' },
  ] },
  { label: 'nav.library', links: [
    { label: 'history.myList', path: '/history?tab=list', icon: 'list' },
    { label: 'catalog.continueWatching', path: '/continue-watching', icon: 'play' },
    { label: 'nav.history', path: '/history', icon: 'history' },
    { label: 'nav.downloads', path: '/downloads', icon: 'download' },
  ] },
  { label: 'ui.tools', links: [
    { label: 'nav.providers', path: '/providers', icon: 'providers' },
    { label: 'nav.settings', path: '/settings', icon: 'settings' },
  ] },
] as const

export function Navigation() {
  const { t } = useTranslation()
  const location = useLocation()
  const list = new URLSearchParams(location.search).get('tab') === 'list'
  return <nav className="km-navigation" aria-label={t('ui.mainNavigation')}>
    {groups.map((group) => <div key={group.label} className="km-nav-group">
      <p className="km-nav-section km-nav-label">{t(group.label)}</p>
      {group.links.map((link) => {
        const [pathname] = link.path.split('?')
        const active = location.pathname === pathname && (pathname !== '/history' || (link.path.includes('?') === list))
        return <Link key={link.path} to={link.path} aria-label={t(link.label)} title={t(link.label)} aria-current={active ? 'page' : undefined} className={'km-nav-link ' + (active ? 'km-nav-active' : '')}>
          <Icon name={link.icon} /><span className="km-nav-label">{t(link.label)}</span>
        </Link>
      })}
    </div>)}
    <button type="button" className="km-nav-link" title={t('ui.help')} aria-label={t('ui.help')} onClick={() => window.dispatchEvent(new Event('kokomovie:help'))}><Icon name="help" /><span className="km-nav-label">{t('ui.help')}</span></button>
  </nav>
}
