import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSettingsStore } from '../store/settings'
import { userApi, type Preferences } from '../api/user'
import { libraryPortabilityApi, type LibraryImportSelection } from '../api/library-portability'
import { LOCAL_PROFILE } from '../lib/local-identity'
import { AppLayout } from '../components/layout/AppLayout'
import tmdbLogo from '../assets/tmdb/tmdb-logo.svg'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'
import { LanguageSelect } from '../components/ui/LanguageSelect'
import { useTranslation } from 'react-i18next'
import { normalizeLocale, type AppLocale } from '../../main/locales'
import { applyLocale } from '../i18n/locale-controller'
import { createBrowserLocaleDependencies } from '../i18n/LocaleBootstrap'

const RATINGS = ['G', 'PG', 'PG-13', 'R', 'TV-MA'] as const

// ─── Reusable Components ─────────────────────────────────────────────────────

function SectionCard({ icon, title, description, children }: {
  icon: React.ReactNode
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white/[0.04] backdrop-blur-md rounded-2xl border border-white/[0.08] p-6 transition-all duration-300 hover:border-white/[0.12]">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-white/60 shrink-0">{icon}</span>
        <div>
          <h2 className="text-white font-semibold text-[15px]">{title}</h2>
          {description && <p className="text-white/40 text-xs mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function SettingRow({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-white text-sm">{label}</p>
        {description && <p className="text-white/35 text-xs mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${enabled ? 'bg-km-accent' : 'bg-white/20'}`}
      aria-pressed={enabled}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function SaveToast({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  const { t } = useTranslation()
  if (status === 'idle') return null
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl backdrop-blur-lg transition-all duration-300 animate-slide-up flex items-center gap-2.5 ${
      status === 'saved' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' :
      status === 'error' ? 'bg-red-500/20 border border-red-500/30 text-red-300' :
      'bg-white/10 border border-white/20 text-white/70'
    }`}>
      {status === 'saved' && (
        <>
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {t('settings.settingsSaved')}
        </>
      )}
      {status === 'error' && (
        <>
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {t('common.failedToSave')}
        </>
      )}
      {status === 'saving' && (
        <>
          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
          {t('common.saving')}
        </>
      )}
    </div>
  )
}

// ─── TMDB Instructions Panel ─────────────────────────────────────────────────

function TmdbInstructions({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="mt-4">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-violet-400 hover:text-violet-300 text-xs font-medium transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {isOpen ? t('settings.hideInstructions') : t('settings.getTmdbKey')}
      </button>

      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[600px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
          <p className="text-white/50 text-xs leading-relaxed">
            {t('settings.tmdbInstructionsIntro')}
          </p>

          <ol className="space-y-3">
            {[
              { step: '1', title: t('settings.tmdbStep1Title'), desc: t('settings.tmdbStep1') },
              { step: '2', title: t('settings.tmdbStep2Title'), desc: t('settings.tmdbStep2') },
              { step: '3', title: t('settings.tmdbStep3Title'), desc: t('settings.tmdbStep3') },
              { step: '4', title: t('settings.tmdbStep4Title'), desc: t('settings.tmdbStep4') },
              { step: '5', title: t('settings.tmdbStep5Title'), desc: t('settings.tmdbStep5') },
              { step: '6', title: t('settings.tmdbStep6Title'), desc: t('settings.tmdbStep6') },
            ].map(({ step, title, desc }) => (
              <li key={step} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold flex items-center justify-center mt-0.5">
                  {step}
                </span>
                <div>
                  <p className="text-white/80 text-sm font-medium">{title}</p>
                  <p className="text-white/40 text-xs mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="flex items-start gap-2 pt-2 border-t border-white/[0.06]">
            <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-white/40 text-[11px] leading-relaxed">
              {t('settings.tmdbKeyPrivacy')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Settings Page ──────────────────────────────────────────────────────

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const activeProfile = LOCAL_PROFILE
  const { tmdbApiKey, setTmdbApiKey, clearTmdbApiKey } = useSettingsStore()
  const qc = useQueryClient()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [downloadPath, setDownloadPath] = useState('')
  const [defaultDownloadPath, setDefaultDownloadPath] = useState('')
  // Auto-update preference. Authoritative copy lives in the main process (so startup
  // respects it); we hydrate the toggle from there and mirror to localStorage for instant UI.
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(() => localStorage.getItem('km_auto_update') !== 'false')
  const [updateCheck, setUpdateCheck] = useState<{ status: 'idle' | 'checking' | 'available' | 'up-to-date' | 'error' | 'dev'; version?: string; message?: string }>({ status: 'idle' })

  // Layout Tab selection
  const [activeTab, setActiveTab] = useState<'preferences' | 'api' | 'downloads' | 'privacy'>('preferences')

  // TMDB key state
  const [tmdbKeyInput, setTmdbKeyInput] = useState(tmdbApiKey)
  const [tmdbKeyVisible, setTmdbKeyVisible] = useState(false)
  const [tmdbValidation, setTmdbValidation] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [tmdbInstructionsOpen, setTmdbInstructionsOpen] = useState(false)
  const [cacheStats, setCacheStats] = useState<{ entries: number; bytes: number } | null>(null)
  const [clearingCache, setClearingCache] = useState(false)
  const [includeExportArtwork, setIncludeExportArtwork] = useState(false)
  const [portabilityBusy, setPortabilityBusy] = useState(false)
  const [importSelection, setImportSelection] = useState<LibraryImportSelection | null>(null)

  const [diagnosticPreview, setDiagnosticPreview] = useState<{ token: string; report: DiagnosticReport } | null>(null)
  const [diagnosticBusy, setDiagnosticBusy] = useState(false)
  useEffect(() => {
    setTmdbKeyInput(tmdbApiKey)
    if (tmdbApiKey) setTmdbValidation('valid')
  }, [tmdbApiKey])

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getDefaultDownloadsDir().then((dir) => {
        setDefaultDownloadPath(dir)
        const custom = localStorage.getItem('custom_download_path')
        setDownloadPath(custom || dir)
      })
      // Hydrate the auto-update toggle from the main process (the source of truth).
      window.electronAPI.getAutoUpdateEnabled?.().then((enabled) => {
        setAutoUpdateEnabled(enabled)
        localStorage.setItem('km_auto_update', String(enabled))
      }).catch(() => {})
      window.electronAPI.getTmdbCacheStats?.().then(setCacheStats).catch(() => {})
    }
  }, [])

  const flashSaved = useCallback(() => {
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2500)
  }, [])

  const handleClearCatalogCache = useCallback(async () => {
    if (!window.electronAPI) return
    setClearingCache(true)
    try {
      await window.electronAPI.clearTmdbCache()
      setCacheStats({ entries: 0, bytes: 0 })
      flashSaved()
    } catch {
      setSaveStatus('error')
    } finally {
      setClearingCache(false)
    }
  }, [flashSaved])

  // Persist the auto-update choice to the main process (which gates the real updater) and
  // mirror it locally. This is the handler the toggle calls with the next value.
  const onToggleAutoUpdate = useCallback((newValue: boolean) => {
    setAutoUpdateEnabled(newValue)
    localStorage.setItem('km_auto_update', String(newValue))
    window.electronAPI?.setAutoUpdateEnabled?.(newValue)
      .then(() => flashSaved())
      .catch(() => setSaveStatus('error'))
  }, [flashSaved])

  // On-demand update check — no need to wait for the automatic 4-hour cycle.
  const handleCheckForUpdates = useCallback(async () => {
    setUpdateCheck({ status: 'checking' })
    try {
      const res = await window.electronAPI?.checkForUpdates?.()
      if (!res) { setUpdateCheck({ status: 'error', message: 'Updater unavailable' }); return }
      if (res.status === 'available') setUpdateCheck({ status: 'available', version: res.version })
      else if (res.status === 'not-available') setUpdateCheck({ status: 'up-to-date', version: res.version })
      else if (res.status === 'dev') setUpdateCheck({ status: 'dev', version: res.version })
      else setUpdateCheck({ status: 'error', message: res.message })
    } catch (e) {
      setUpdateCheck({ status: 'error', message: e instanceof Error ? e.message : 'Check failed' })
    }
  }, [])

  const handleBrowseFolder = async () => {
    if (!window.electronAPI) return
    const dir = await window.electronAPI.selectDirectory()
    if (dir) {
      setDownloadPath(dir)
      localStorage.setItem('custom_download_path', dir)
      flashSaved()
    }
  }

  const handleManualPathChange = (val: string) => {
    setDownloadPath(val)
    if (val.trim()) {
      localStorage.setItem('custom_download_path', val.trim())
    } else {
      localStorage.removeItem('custom_download_path')
    }
  }

  const handleValidateTmdbKey = async () => {
    const key = tmdbKeyInput.trim()
    if (!key) return

    setTmdbValidation('validating')
    try {
      const valid = window.electronAPI
        ? await window.electronAPI.validateTmdbApiKey(key)
        : false
      if (!valid) {
        setTmdbValidation('invalid')
        return
      }
      setTmdbApiKey(key)
      setTmdbValidation('valid')
      flashSaved()
    } catch {
      setTmdbValidation('invalid')
    }
  }

  const handleClearTmdbKey = () => {
    clearTmdbApiKey()
    setTmdbKeyInput('')
    setTmdbValidation('idle')
    flashSaved()
  }


  const profileId = activeProfile.id

  const { data, isLoading } = useQuery({
    queryKey: ['preferences', profileId],
    queryFn: () => userApi.getPreferences(profileId),
    staleTime: 5 * 60 * 1000,
  })

  const prefs: Preferences = data?.data ?? {
    language: 'en-US',
    subtitleDefault: null,
    autoplay: true,
    maturityRating: 'TV-MA',
    isKids: false,
  }

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<Omit<Preferences, 'isKids'>>) =>
      userApi.updatePreferences(payload, profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['preferences', profileId] })
      flashSaved()
    },
    onError: () => setSaveStatus('error'),
  })

  async function handleLanguageChange(locale: AppLocale) {
    setSaveStatus('saving')
    try {
      await applyLocale(locale, createBrowserLocaleDependencies(qc))
      await qc.invalidateQueries({ queryKey: ['preferences', profileId] })
      flashSaved()
    } catch {
      setSaveStatus('error')
    }
  }

  async function handleExport() {
    setPortabilityBusy(true)
    try {
      const result = await libraryPortabilityApi.exportFile(includeExportArtwork)
      if (!result.cancelled) flashSaved()
    } catch {
      setSaveStatus('error')
    } finally {
      setPortabilityBusy(false)
    }
  }

  async function handleSelectImport() {
    setPortabilityBusy(true)
    try {
      const selection = await libraryPortabilityApi.selectImport()
      setImportSelection(selection.cancelled ? null : selection)
    } catch {
      setSaveStatus('error')
    } finally {
      setPortabilityBusy(false)
    }
  }

  async function handleApplyImport(mode: 'merge' | 'replace') {
    if (!importSelection?.token) return
    if (mode === 'replace' && !window.confirm('Replace the current watchlist and playback history with this import? A SQLite backup will be created first.')) return
    setPortabilityBusy(true)
    try {
      await libraryPortabilityApi.applyImport(importSelection.token, mode)
      setImportSelection(null)
      await qc.invalidateQueries()
      flashSaved()
    } catch {
      setSaveStatus('error')
    } finally {
      setPortabilityBusy(false)
    }
  }

  async function handlePrepareDiagnostics() {
    if (!window.electronAPI) return
    setDiagnosticBusy(true)
    try {
      setDiagnosticPreview(await window.electronAPI.previewDiagnostics())
    } catch {
      setSaveStatus('error')
    } finally {
      setDiagnosticBusy(false)
    }
  }

  async function handleSaveDiagnostics() {
    if (!window.electronAPI || !diagnosticPreview) return
    setDiagnosticBusy(true)
    try {
      const result = await window.electronAPI.saveDiagnostics({ token: diagnosticPreview.token })
      if (!result.cancelled) {
        setDiagnosticPreview(null)
        flashSaved()
      }
    } catch {
      setSaveStatus('error')
    } finally {
      setDiagnosticBusy(false)
    }
  }


  return (
    <AppLayout>
      <div className="px-6 py-8 max-w-2xl animate-fade-in flex flex-col h-full overflow-hidden">
        {/* Page Header */}
        <div className="mb-6 shrink-0">
          <h1 className="text-white text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
          <p className="text-white/40 text-sm mt-1">{t('settings.description')}</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/[0.06] mb-6 overflow-x-auto shrink-0 scrollbar-none">
          {[
            {
              id: 'preferences',
              label: t('settings.preferences'),
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )
            },
            {
              id: 'api',
              label: t('settings.apiConfiguration'),
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-2 4a5 5 0 110-10 5 5 0 010 10zM19 9h3m-3 3h3m-9 3h-2a2 2 0 00-2 2v3h6v-3a2 2 0 00-2-2z" />
                </svg>
              )
            },
            {
              id: 'downloads',
              label: t('settings.downloads'),
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )
            },
            {
              id: 'privacy',
              label: t('settings.privacy'),
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )
            }
          ].map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 outline-none select-none ${
                  active
                    ? 'border-violet-500 text-violet-400 bg-violet-500/[0.02]'
                    : 'border-transparent text-white/40 hover:text-white/80 hover:bg-white/[0.01]'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Scrollable Settings Panel */}
        <div className="flex-1 overflow-y-auto pr-1 -mr-3 space-y-5 pb-8 scrollbar-thin">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Tab: Preferences ────────────────────────────────────────── */}
              {activeTab === 'preferences' && (
                <>

                  <SectionCard
                    icon={(
                      <svg className="w-5 h-5 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    title={t('settings.playback')}
                    description={t('settings.playbackDescription')}
                  >
                    <SettingRow label={t('settings.interfaceLanguage')} description={t('settings.languageDescription')}>
                      <LanguageSelect
                        value={normalizeLocale(i18n.language || prefs.language)}
                        disabled={saveStatus === 'saving'}
                        onChange={(locale) => { void handleLanguageChange(locale) }}
                      />
                    </SettingRow>

                    <SettingRow label={t('settings.autoplay')} description={t('settings.autoplayDescription')}>
                      <Toggle enabled={prefs.autoplay} onChange={() => updateMutation.mutate({ autoplay: !prefs.autoplay })} />
                    </SettingRow>

                    <SettingRow label={t('settings.maturity')} description={t('settings.maturityDescription')}>
                      <select
                        value={prefs.maturityRating}
                        onChange={(e) => updateMutation.mutate({ maturityRating: e.target.value as typeof RATINGS[number] })}
                        className="bg-white/[0.06] border border-white/[0.12] text-white text-sm rounded-lg px-3 py-1.5 focus:border-violet-500 focus:outline-none transition-colors cursor-pointer"
                      >
                        {RATINGS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </SettingRow>

                    <SettingRow label={t('settings.subtitleDefault')} description={t('settings.subtitleDescription')}>
                      <input
                        type="text"
                        value={prefs.subtitleDefault ?? ''}
                        placeholder={t('common.off')}
                        maxLength={10}
                        onChange={(e) => updateMutation.mutate({ subtitleDefault: e.target.value || null })}
                        className="bg-white/[0.06] border border-white/[0.12] text-white text-sm rounded-lg px-3 py-1.5 w-24 text-center focus:border-violet-500 focus:outline-none transition-colors"
                      />
                    </SettingRow>
                  </SectionCard>

                  <SectionCard
                    icon={(
                      <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    title={t('settings.applicationUpdates')}
                    description={t('settings.applicationUpdatesDescription')}
                  >
                    <SettingRow
                      label={t('settings.automaticUpdates')}
                      description={t('settings.automaticUpdatesDescription')}
                    >
                      <ToggleSwitch checked={autoUpdateEnabled} onChange={onToggleAutoUpdate} label={t('settings.automaticUpdates')} />
                    </SettingRow>

                    <SettingRow
                      label={t('settings.checkForUpdates')}
                      description={t('settings.checkForUpdatesDescription')}
                    >
                      <div className="flex flex-col items-end gap-1.5">
                        <button
                          onClick={handleCheckForUpdates}
                          disabled={updateCheck.status === 'checking'}
                          className="flex items-center gap-2 rounded-lg bg-white/[0.06] border border-white/[0.12] px-3 py-1.5 text-sm text-white hover:bg-white/10 hover:border-violet-500/40 disabled:opacity-60 transition-colors"
                        >
                          {updateCheck.status === 'checking' && (
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          )}
                          {updateCheck.status === 'checking' ? t('settings.checkingUpdates') : t('settings.checkNow')}
                        </button>
                        {updateCheck.status === 'up-to-date' && (
                          <span className="text-[11px] text-emerald-300/80">{t('settings.latestVersion', { version: updateCheck.version ? `v${updateCheck.version}` : '' })}</span>
                        )}
                        {updateCheck.status === 'available' && (
                          <span className="text-[11px] text-violet-300">{t('settings.updateFound', { version: updateCheck.version ? `v${updateCheck.version}` : '' })}</span>
                        )}
                        {updateCheck.status === 'dev' && (
                          <span className="text-[11px] text-white/40">{t('settings.installedAppOnly')}</span>
                        )}
                        {updateCheck.status === 'error' && (
                          <span className="text-[11px] text-red-300/80">{updateCheck.message || t('settings.checkFailed')}</span>
                        )}
                      </div>
                    </SettingRow>
                  </SectionCard>
                </>
              )}

              {/* ── Tab: API Configuration ──────────────────────────────────── */}
              {activeTab === 'api' && (
                <SectionCard
                  icon={(
                    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-2 4a5 5 0 110-10 5 5 0 010 10zM19 9h3m-3 3h3m-9 3h-2a2 2 0 00-2 2v3h6v-3a2 2 0 00-2-2z" />
                    </svg>
                  )}
                  title={t('settings.apiConfiguration')}
                  description={t('settings.apiDescription')}
                >
                  <div className="space-y-4">
                    {/* Key input */}
                    <div>
                      <label className="text-white text-sm font-medium block mb-2">{t('settings.tmdbApiKey')}</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={tmdbKeyVisible ? 'text' : 'password'}
                            value={tmdbKeyInput}
                            onChange={(e) => {
                              setTmdbKeyInput(e.target.value)
                              if (tmdbValidation !== 'idle') setTmdbValidation('idle')
                            }}
                            placeholder={t('settings.tmdbKeyPlaceholder')}
                            spellCheck={false}
                            autoComplete="off"
                            className="w-full bg-white/[0.06] border border-white/[0.12] text-white text-sm rounded-lg pl-3 pr-10 py-2.5 focus:border-violet-500 focus:outline-none transition-colors font-mono tracking-wider"
                          />
                          <button
                            onClick={() => setTmdbKeyVisible(!tmdbKeyVisible)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                            title={tmdbKeyVisible ? t('settings.hideKey') : t('settings.showKey')}
                          >
                            {tmdbKeyVisible ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleValidateTmdbKey}
                        disabled={!tmdbKeyInput.trim() || tmdbValidation === 'validating'}
                        className="bg-violet-600 hover:bg-violet-500 disabled:bg-white/[0.06] disabled:text-white/30 text-white text-sm font-medium px-5 py-2 rounded-lg transition-all duration-200 active:scale-[0.97] disabled:active:scale-100"
                      >
                        {tmdbValidation === 'validating' ? (
                          <span className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            {t('settings.validating')}
                          </span>
                        ) : t('settings.validateKey')}
                      </button>

                      {tmdbApiKey && (
                        <button
                          onClick={handleClearTmdbKey}
                          className="text-red-400/80 hover:text-red-300 text-sm font-medium transition-colors"
                        >
                          {t('settings.removeKey')}
                        </button>
                      )}

                      {/* Status indicator */}
                      {tmdbValidation === 'valid' && (
                        <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium animate-fade-in">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          {t('settings.valid')}
                        </span>
                      )}
                      {tmdbValidation === 'invalid' && (
                        <span className="flex items-center gap-1.5 text-red-400 text-sm font-medium animate-fade-in">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {t('settings.invalidKey')}
                        </span>
                      )}
                    </div>

                    {/* Instructions toggle */}
                    <TmdbInstructions
                      isOpen={tmdbInstructionsOpen}
                      onToggle={() => setTmdbInstructionsOpen(!tmdbInstructionsOpen)}
                    />

                    <div className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                      <a
                        href="https://www.themoviedb.org/"
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0"
                        aria-label={t('settings.visitTmdb')}
                      >
                        <img src={tmdbLogo} alt="The Movie Database" className="h-12 w-12" />
                      </a>
                      <p className="text-xs leading-relaxed text-white/45">
                        {t('settings.tmdbAttribution')}
                      </p>
                    </div>
                  </div>
                </SectionCard>
              )}

              {/* ── Tab: Downloads ──────────────────────────────────────────── */}
              {activeTab === 'downloads' && (
                <SectionCard
                  icon={(
                    <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                  title={t('settings.downloads')}
                  description={t('settings.downloadsDescription')}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-white text-sm">{t('settings.downloadLocation')}</label>
                      {downloadPath !== defaultDownloadPath && (
                        <button
                          onClick={() => {
                            setDownloadPath(defaultDownloadPath)
                            localStorage.removeItem('custom_download_path')
                            flashSaved()
                          }}
                          className="text-violet-400 hover:text-violet-300 text-xs font-medium transition-colors"
                        >
                          {t('settings.resetDefault')}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={downloadPath}
                        onChange={(e) => handleManualPathChange(e.target.value)}
                        className="bg-white/[0.06] border border-white/[0.12] text-white text-sm rounded-lg px-3 py-2 flex-1 focus:border-violet-500 focus:outline-none transition-colors"
                        placeholder={t('settings.defaultDownloadFolder')}
                      />
                      <button
                        onClick={handleBrowseFolder}
                        className="bg-white/[0.08] hover:bg-white/[0.14] text-white text-sm font-medium px-4 py-2 rounded-lg transition-all duration-200 active:scale-[0.97] border border-white/[0.08]"
                      >
                        {t('settings.browseFolder')}
                      </button>
                    </div>
                    <p className="text-white/30 text-[11px] leading-relaxed">
                      {t('settings.downloadFolderDescription')}
                    </p>
                  </div>
                </SectionCard>
              )}

              {/* ── Tab: Privacy ────────────────────────────────────────────── */}
              {activeTab === 'privacy' && (
                <SectionCard
                  icon={(
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  )}
                  title={t('settings.privacy')}
                  description={t('settings.privacyDescription')}
                >
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-white text-sm">{t('settings.portableLibrary')}</p>
                          <p className="text-white/35 text-xs mt-0.5">
                            {t('settings.portableLibraryDescription')}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={handleSelectImport}
                            disabled={portabilityBusy}
                            className="bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-white/80 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                          >
                            {t('settings.import')}
                          </button>
                          <button
                            onClick={handleExport}
                            disabled={portabilityBusy}
                            className="bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-white/80 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                          >
                            {t('settings.export')}
                          </button>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-white/50">
                        <input
                          type="checkbox"
                          checked={includeExportArtwork}
                          onChange={(event) => setIncludeExportArtwork(event.target.checked)}
                          className="accent-violet-500"
                        />
                        {t('settings.includeArtwork')}
                      </label>
                      {importSelection?.preview && (
                        <div className="rounded-lg border border-violet-400/20 bg-violet-500/5 p-3">
                          <p className="text-white/80 text-xs font-semibold">{t('settings.importPreview')}</p>
                          <p className="text-white/45 text-xs mt-1">
                            {t('settings.importCounts', { watchlist: importSelection.preview.watchlist, history: importSelection.preview.positions, artwork: importSelection.preview.artwork })}
                          </p>
                          <p className="text-white/35 text-[11px] mt-1">
                            {t('settings.importConflicts', { count: importSelection.preview.watchlistConflicts + importSelection.preview.positionConflicts })}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => handleApplyImport('merge')}
                              disabled={portabilityBusy}
                              className="bg-violet-500/20 text-violet-200 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                            >
                              {t('settings.mergeNewest')}
                            </button>
                            <button
                              onClick={() => handleApplyImport('replace')}
                              disabled={portabilityBusy}
                              className="bg-red-500/10 text-red-300 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                            >
                              {t('settings.replaceLibrary')}
                            </button>
                            <button
                              onClick={() => setImportSelection(null)}
                              disabled={portabilityBusy}
                              className="text-white/40 px-2 py-1.5 text-xs"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-white/[0.08] pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-white text-sm">{t('settings.diagnosticReport')}</p>
                          <p className="text-white/35 text-xs mt-0.5">
                            {t('settings.diagnosticDescription')}
                          </p>
                        </div>
                        <button
                          onClick={handlePrepareDiagnostics}
                          disabled={diagnosticBusy}
                          className="bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-white/80 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          {diagnosticBusy ? t('settings.preparing') : t('settings.prepareReport')}
                        </button>
                      </div>
                      {diagnosticPreview && (
                        <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                          <p className="text-white/80 text-xs font-semibold">{t('settings.reviewBeforeSaving')}</p>
                          <p className="text-white/35 text-[11px] mt-1">
                            {t('settings.diagnosticExcludes')}
                          </p>
                          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2 text-[10px] text-white/55">
                            {JSON.stringify(diagnosticPreview.report, null, 2)}
                          </pre>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={handleSaveDiagnostics}
                              disabled={diagnosticBusy}
                              className="bg-emerald-500/20 text-emerald-200 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                            >
                              {t('settings.saveReviewedReport')}
                            </button>
                            <button
                              onClick={() => setDiagnosticPreview(null)}
                              disabled={diagnosticBusy}
                              className="text-white/40 px-2 py-1.5 text-xs"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-white/[0.08] pt-4">
                      <div>
                        <p className="text-white text-sm">{t('settings.catalogCache')}</p>
                        <p className="text-white/35 text-xs mt-0.5">
                          {cacheStats ? t('settings.cacheUsage', { count: cacheStats.entries, size: (cacheStats.bytes / 1024 / 1024).toFixed(1) }) : t('settings.loadingCache')}
                        </p>
                        <p className="text-white/25 text-[11px] mt-1">{t('settings.clearCacheSafety')}</p>
                      </div>
                      <button
                        onClick={handleClearCatalogCache}
                        disabled={clearingCache}
                        className="bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-white/80 hover:text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-all"
                      >
                        {clearingCache ? t('settings.clearing') : t('settings.clearCache')}
                      </button>
                    </div>
                  </div>
                </SectionCard>
              )}
            </>
          )}
        </div>
      </div>

      <SaveToast status={saveStatus} />
    </AppLayout>
  )
}
