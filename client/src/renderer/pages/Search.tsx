import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../store/settings'
import { catalogApi } from '../api/catalog'
import { AppLayout } from '../components/layout/AppLayout'
import { GlobalSearch } from '../components/layout/GlobalSearch'
import { ContentCard } from '../components/catalog/ContentCard'
import { CategoryPagination, scrollCatalogToTop } from '../components/catalog/CategoryPagination'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { CatalogFallbackBanner } from '../components/catalog/CatalogFallbackBanner'

export function SearchPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const tmdbApiKey = useSettingsStore((state) => state.tmdbApiKey)
  const [params, setParams] = useSearchParams()
  const query = (params.get('q') ?? '').trim()
  const requestedType = params.get('type')
  const type = requestedType === 'movie' || requestedType === 'series' ? requestedType : undefined
  const requestedPage = Number(params.get('page') ?? 1)
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 500 ? requestedPage : 1
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400)
    return () => clearTimeout(timer)
  }, [query])
  const search = useQuery({
    queryKey: ['search', debouncedQuery, type, page, 'local', tmdbApiKey],
    queryFn: () => catalogApi.search(debouncedQuery, { type, page }, 'local'),
    enabled: query.length >= 2 && query === debouncedQuery,
    staleTime: 2 * 60 * 1000,
  })
  const results = search.data?.data ?? []
  const pages = search.data?.meta.pages ?? 1
  useEffect(() => {
    const effectivePage = search.data?.meta.page
    if (effectivePage !== undefined && effectivePage !== page && query === debouncedQuery) {
      const next = new URLSearchParams(params)
      effectivePage === 1 ? next.delete('page') : next.set('page', String(effectivePage))
      setParams(next, { replace: true })
    }
  }, [search.data?.meta.page, page, query, debouncedQuery, params, setParams])
  const update = (changes: { type?: string; page?: number }) => {
    const next = new URLSearchParams(params)
    if ('type' in changes) { changes.type ? next.set('type', changes.type) : next.delete('type'); next.delete('page') }
    if (changes.page) next.set('page', String(changes.page))
    setParams(next)
    scrollCatalogToTop()
  }
  return <AppLayout><div className="km-page km-search-page">
    <button type="button" className="km-button-secondary mb-5" onClick={() => navigate(-1)}>{t('common.back')}</button>
    <PageHeader title={t('ui.searchTitle')} description={t('ui.searchDescription')} eyebrow={t('nav.discover')} />
    <GlobalSearch />
    <div className="mb-8 flex flex-wrap gap-2" aria-label={t('ui.searchTitle')}>
      {([[undefined, 'ui.allTitles'], ['movie', 'nav.movies'], ['series', 'nav.series']] as const).map(([value, label]) =>
        <button key={label} type="button" aria-pressed={type === value} onClick={() => update({ type: value })} className={'rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ' + (type === value ? 'border-violet-500/40 bg-violet-500/20 text-violet-100' : 'border-km-border bg-km-surface text-purple-100/70 hover:text-white')}>{t(label)}</button>)}
    </div>
    {query.length < 2 && <EmptyState title={t('catalog.searchPrompt')} description={t('ui.searchMinimum')} />}
    {query.length >= 2 && (search.isFetching || query !== debouncedQuery) && <p role="status" className="py-12 text-purple-100/70">{t('common.loading')}</p>}
    {query.length >= 2 && query === debouncedQuery && !search.isFetching && <>
      {search.isError ? <EmptyState title={t('catalog.searchFailed')} action={<button type="button" className="km-button-secondary" onClick={() => search.refetch()}>{t('common.retry')}</button>} /> : search.data && <>
        <CatalogFallbackBanner source={search.data.meta.source} />
        <p className="mb-5 text-sm text-purple-100/70" aria-live="polite">{t('catalog.resultCount', { count: results.length, query })}</p>
        {!results.length && <EmptyState title={t('catalog.noResultsFor', { query })} />}
        <div className="grid gap-x-5 gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(156px, 1fr))' }}>
          {results.map((item) => <ContentCard key={item.id} content={item} size="md" />)}
        </div>
        <CategoryPagination page={page} totalPages={pages} onPageChange={(next) => update({ page: next })} />
      </>}
    </>}
  </div></AppLayout>
}
