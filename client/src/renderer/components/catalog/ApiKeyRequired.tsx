import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../layout/AppLayout'
import { useTranslation } from 'react-i18next'

/**
 * Full-screen gate shown on the catalog pages when the signed-in account has no
 * TMDB API key configured. A key is required for the app to work, so instead of
 * showing a thin local-only catalog we tell the user exactly what to do. The key
 * is stored per account in the OS keychain, so it only has to be entered once
 * per account (see App.tsx / store/settings.ts).
 */
export function ApiKeyRequired() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 text-center px-8 animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-km-border/40 bg-km-surface-2 shadow-lg">
          <svg className="h-8 w-8 text-km-accent" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.03 5.91l-2.47 2.47a2.12 2.12 0 0 1-1.5.62H9v1.75a.75.75 0 0 1-.75.75H6.5v1.75a.75.75 0 0 1-.75.75H3.75A1.75 1.75 0 0 1 2 21.5v-2.04c0-.46.18-.9.51-1.23l6.58-6.58A6 6 0 1 1 21.75 8.25Z" />
          </svg>
        </div>

        <div className="max-w-md space-y-2">
          <h2 className="text-xl font-bold text-white">{t('catalog.apiKeyRequired')}</h2>
          <p className="text-sm leading-relaxed text-purple-300/70">
            {t('catalog.apiKeyDescription')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/settings')}
            className="rounded-lg bg-km-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-km-accent-hover"
          >
            {t('catalog.addApiKey')}
          </button>
          <a
            href="https://www.themoviedb.org/settings/api"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-km-border/50 px-5 py-2.5 text-sm font-medium text-purple-200 transition-colors hover:bg-white/5"
          >
            {t('settings.getFreeKey', { defaultValue: 'Get a free key' })}
          </a>
        </div>

        <p className="text-xs text-purple-300/40">
          {t('settings.keyLocalNote', { defaultValue: 'Your key is stored locally on this device.' })}
        </p>
      </div>
    </AppLayout>
  )
}
