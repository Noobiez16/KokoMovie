import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { catalogApi } from '../../api/catalog'

export function GenreNavigation({ type }: { type: 'movie' | 'series' }) {
  const { t, i18n } = useTranslation()
  const [params] = useSearchParams()
  const base = type === 'movie' ? '/movies' : '/series'
  const trending = params.get('collection') === 'trending' || params.get('genre') === 'trending'
  const genre = trending ? null : params.get('genre')
  const { data } = useQuery({ queryKey: ['catalog-genres', 'local', i18n?.language], queryFn: () => catalogApi.getGenres('local'), staleTime: 300000 })
  const link = (label: string, to: string, active: boolean) => <Link key={to} to={to} className="km-genre-link" aria-current={active ? 'page' : undefined}>{label}</Link>
  return <nav aria-label={t('catalog.genreNavigation')} className="km-genre-navigation km-catalog-gutter">
    {link(t('catalog.featured'), base, !genre && !trending)}
    {link(t('catalog.trending'), `${base}?collection=trending`, trending)}
    {data?.data.filter(g => g.slug && g.slug !== 'trending').map(g => link(g.name, `${base}?genre=${encodeURIComponent(g.slug)}`, genre === g.slug))}
  </nav>
}
