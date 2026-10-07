import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { decodeTmdbContentId } from '../../lib/tmdb'

export function isPrimaryDestinationActive(location: { pathname: string; state: unknown }, path: string): boolean {
  const detail = location.pathname.startsWith('/content/')
  const tmdbType = (location.state as { tmdbType?: string } | null)?.tmdbType
  const detailType = tmdbType ?? decodeTmdbContentId(location.pathname.slice('/content/'.length))?.type
  return location.pathname === path || (detail && ((path === '/series' && detailType === 'tv') || (path === '/movies' && detailType === 'movie')))
}

export function Navigation() {
  const { t } = useTranslation()
  const location = useLocation()
  return <nav className="km-primary-nav" aria-label={t('ui.mainNavigation')}>
    {([['nav.home', '/browse'], ['nav.movies', '/movies'], ['nav.series', '/series']] as const).map(([label, path]) => {
      const active = isPrimaryDestinationActive(location, path)
      return <Link key={path} to={path} aria-current={active ? 'page' : undefined} className={'km-primary-link ' + (active ? 'km-nav-active' : '')}>{t(label)}</Link>
    })}
  </nav>
}
