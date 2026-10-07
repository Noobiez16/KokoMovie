import { useTranslation } from 'react-i18next'
import logo from '../assets/logo.png'

export function DesktopRequired() {
  const { t } = useTranslation()
  return <main className="min-h-screen bg-km-bg flex items-center justify-center px-6 py-12">
    <div className="w-full max-w-lg rounded-2xl border border-km-border bg-km-surface p-8 text-center">
      <img src={logo} alt="KokoMovie" className="mx-auto mb-6 h-16 w-16 rounded-xl" />
      <h1 className="text-2xl font-semibold text-km-text">{t('ui.desktopRequiredTitle')}</h1>
      <p className="mt-4 text-sm leading-6 text-km-text-muted">{t('ui.desktopRequiredDescription')}</p>
      <p className="mt-6 text-sm leading-6 text-km-text">{t('ui.desktopRequiredDevHint', { command: 'npm run dev' })}</p>
    </div>
  </main>
}
