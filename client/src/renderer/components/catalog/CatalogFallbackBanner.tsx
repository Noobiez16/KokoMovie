import { useNavigate } from 'react-router-dom'
import type { CatalogSource } from '../../api/catalog'
import { useTranslation } from 'react-i18next'

/**
 * Shown when the catalog service answered from its small local database instead
 * of TMDB (`meta.source === 'local'`). That happens when no valid TMDB API key
 * is reaching the catalog — which makes the library look tiny ("See All" shows
 * only a page or two) and categories sparse. Point the user at Settings so they
 * can add their key and unlock the full catalog.
 */
export function CatalogFallbackBanner({ source }: { source?: CatalogSource }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  if (source !== 'local' && source !== 'cache') return null

  return (
    <div className="mx-8 mt-4 flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-100 animate-fade-in">
      <svg className="h-5 w-5 shrink-0 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{source === 'cache' ? t('catalog.showingSaved') : t('catalog.limitedOffline')}</p>
        <p className="text-xs text-amber-200/70">
          {source === 'cache' ? t('catalog.cachedNotice') : t('catalog.localNotice')}
        </p>
      </div>
      {source === 'local' && <button
        onClick={() => navigate('/settings')}
        className="shrink-0 rounded-lg bg-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-400/30"
      >
        {t('catalog.addApiKey')}
      </button>}
    </div>
  )
}
