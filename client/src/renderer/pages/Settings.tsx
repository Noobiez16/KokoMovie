import { useState, useRef, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'
import { userApi, type Preferences } from '../api/user'
import { AppLayout } from '../components/layout/AppLayout'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'

const LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'pt-BR', label: 'Português (BR)' },
]

const RATINGS = ['G', 'PG', 'PG-13', 'R', 'TV-MA'] as const

// ─── Preset Avatars ─────────────────────────────────────────────────────────

const PRESET_AVATARS = [
  {
    id: 'palm',
    name: 'Koko Palm',
    gradient: 'from-orange-500 to-rose-500',
    svg: (
      <svg viewBox="0 0 100 100" className="w-10 h-10">
        <path d="M50,90 L50,60" stroke="#fff" strokeWidth="6" strokeLinecap="round"/>
        <path d="M50,60 Q20,50 15,35 Q35,45 50,60" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
        <path d="M50,60 Q80,50 85,35 Q65,45 50,60" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
        <path d="M50,60 C50,20 40,10 40,10 C60,20 50,60 50,60" fill="#fff"/>
      </svg>
    ),
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23FF512F"/><stop offset="100%" stop-color="%23DD2476"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g1)"/><path d="M50,90 L50,60" stroke="%23fff" stroke-width="6" stroke-linecap="round"/><path d="M50,60 Q20,50 15,35 Q35,45 50,60" fill="none" stroke="%23fff" stroke-width="4" stroke-linecap="round"/><path d="M50,60 Q80,50 85,35 Q65,45 50,60" fill="none" stroke="%23fff" stroke-width="4" stroke-linecap="round"/><path d="M50,60 C50,20 40,10 40,10 C60,20 50,60 50,60" fill="%23fff"/></svg>'
  },
  {
    id: 'cinema',
    name: 'Retro Cinema',
    gradient: 'from-teal-500 to-emerald-500',
    svg: (
      <svg viewBox="0 0 100 100" className="w-10 h-10">
        <rect x="25" y="30" width="50" height="40" rx="5" fill="none" stroke="#fff" strokeWidth="5"/>
        <polygon points="45,40 60,50 45,60" fill="#fff"/>
        <circle cx="35" cy="18" r="4" fill="#fff"/>
        <circle cx="65" cy="18" r="4" fill="#fff"/>
        <path d="M35,22 L30,30 M65,22 L70,30" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    ),
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2311998e"/><stop offset="100%" stop-color="%2338ef7d"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g2)"/><rect x="25" y="30" width="50" height="40" rx="5" fill="none" stroke="%23fff" stroke-width="5"/><polygon points="45,40 60,50 45,60" fill="%23fff"/><circle cx="35" cy="18" r="4" fill="%23fff"/><circle cx="65" cy="18" r="4" fill="%23fff"/><path d="M35,22 L30,30 M65,22 L70,30" stroke="%23fff" stroke-width="3" stroke-linecap="round"/></svg>'
  },
  {
    id: 'space',
    name: 'Voyager',
    gradient: 'from-purple-600 via-rose-500 to-orange-500',
    svg: (
      <svg viewBox="0 0 100 100" className="w-10 h-10">
        <circle cx="50" cy="50" r="18" fill="#fff"/>
        <ellipse cx="50" cy="50" rx="35" ry="8" fill="none" stroke="#fff" strokeWidth="4" transform="rotate(-20 50 50)"/>
        <circle cx="30" cy="25" r="2" fill="#fff"/>
        <circle cx="70" cy="65" r="3" fill="#fff"/>
      </svg>
    ),
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%238A2387"/><stop offset="50%" stop-color="%23E94057"/><stop offset="100%" stop-color="%23F27121"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g3)"/><circle cx="50" cy="50" r="18" fill="%23fff"/><ellipse cx="50" cy="50" rx="35" ry="8" fill="none" stroke="%23fff" stroke-width="4" transform="rotate(-20 50 50)"/><circle cx="30" cy="25" r="2" fill="%23fff"/><circle cx="70" cy="65" r="3" fill="%23fff"/></svg>'
  },
  {
    id: 'star',
    name: 'Spotlight',
    gradient: 'from-amber-500 to-indigo-900',
    svg: (
      <svg viewBox="0 0 100 100" className="w-10 h-10">
        <path d="M50,15 L59,36 L81,36 L64,49 L70,70 L50,58 L30,70 L36,49 L19,36 L41,36 Z" fill="#fff"/>
      </svg>
    ),
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23F3904F"/><stop offset="100%" stop-color="%233B4371"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g4)"/><path d="M50,15 L59,36 L81,36 L64,49 L70,70 L50,58 L30,70 L36,49 L19,36 L41,36 Z" fill="%23fff"/></svg>'
  },
  {
    id: 'wave',
    name: 'Synthwave',
    gradient: 'from-indigo-600 to-purple-400',
    svg: (
      <svg viewBox="0 0 100 100" className="w-10 h-10">
        <path d="M15,50 Q30,35 45,50 T75,50" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
        <path d="M25,60 Q40,45 55,60 T85,60" fill="none" stroke="#fff" strokeWidth="4" opacity="0.6" strokeLinecap="round"/>
        <path d="M5,40 Q20,25 35,40 T65,40" fill="none" stroke="#fff" strokeWidth="4" opacity="0.4" strokeLinecap="round"/>
      </svg>
    ),
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%234e54c8"/><stop offset="100%" stop-color="%238f94fb"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g5)"/><path d="M15,50 Q30,35 45,50 T75,50" fill="none" stroke="%23fff" stroke-width="4" stroke-linecap="round"/><path d="M25,60 Q40,45 55,60 T85,60" fill="none" stroke="%23fff" stroke-width="4" opacity="0.6" stroke-linecap="round"/><path d="M5,40 Q20,25 35,40 T65,40" fill="none" stroke="%23fff" stroke-width="4" opacity="0.4" stroke-linecap="round"/></svg>'
  },
  {
    id: 'mountain',
    name: 'Peak',
    gradient: 'from-pink-500 to-cyan-500',
    svg: (
      <svg viewBox="0 0 100 100" className="w-10 h-10">
        <circle cx="50" cy="40" r="15" fill="#fff" opacity="0.8"/>
        <polygon points="15,80 50,35 85,80" fill="#fff" opacity="0.9"/>
        <polygon points="35,80 60,50 85,80" fill="#fff" opacity="0.5"/>
      </svg>
    ),
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23fc00ff"/><stop offset="100%" stop-color="%2300dbde"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g6)"/><circle cx="50" cy="40" r="15" fill="%23fff" opacity="0.8"/><polygon points="15,80 50,35 85,80" fill="%23fff" opacity="0.9"/><polygon points="35,80 60,50 85,80" fill="%23fff" opacity="0.5"/></svg>'
  }
]

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
          Settings saved
        </>
      )}
      {status === 'error' && (
        <>
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Failed to save. Try again.
        </>
      )}
      {status === 'saving' && (
        <>
          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
          Saving...
        </>
      )}
    </div>
  )
}

// ─── TMDB Instructions Panel ─────────────────────────────────────────────────

function TmdbInstructions({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="mt-4">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-violet-400 hover:text-violet-300 text-xs font-medium transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {isOpen ? 'Hide instructions' : 'How to get a TMDB API Key'}
      </button>

      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[600px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
          <p className="text-white/50 text-xs leading-relaxed">
            TMDB (The Movie Database) provides free API keys for personal use. Follow these steps:
          </p>

          <ol className="space-y-3">
            {[
              { step: '1', title: 'Create an account', desc: (
                <>Go to <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors">themoviedb.org/signup</a> and create a free account (or log in if you already have one).</>
              )},
              { step: '2', title: 'Verify your email', desc: 'Check your inbox and click the verification link.' },
              { step: '3', title: 'Go to API settings', desc: (
                <>Navigate to <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors">Settings → API</a> in your TMDB account.</>
              )},
              { step: '4', title: 'Request an API key', desc: 'Click "Create" or "Request an API Key". Select "Developer" as the type. Fill in the application details (you can use "Personal Use" as the description).' },
              { step: '5', title: 'Copy your API Key', desc: 'Once approved, copy the "API Key (v3 auth)" value. This is typically a 32-character alphanumeric string.' },
              { step: '6', title: 'Paste it here', desc: 'Paste the key in the field above and click "Validate Key" to confirm it works.' },
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
              Your API key is stored <strong className="text-white/60">locally on this device only</strong> and is never shared with KokoMovie servers. It is sent directly to TMDB's servers to fetch movie/show data.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Settings Page ──────────────────────────────────────────────────────

export function SettingsPage() {
  const { isAuthenticated, activeProfile, setActiveProfile } = useAuthStore()
  const { tmdbApiKey, setTmdbApiKey, clearTmdbApiKey } = useSettingsStore()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [avatarUploading, setAvatarUploading] = useState(false)
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
    }
  }, [])

  const flashSaved = useCallback(() => {
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2500)
  }, [])

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
      // TMDB keys come in two flavours: a v3 API key (sent as ?api_key=) or a
      // v4 read access token (a JWT sent as a Bearer header). Validate whichever
      // the user pasted so v4 tokens aren't wrongly rejected.
      const isV4 = key.startsWith('eyJ') || key.length > 40
      const res = isV4
        ? await fetch('https://api.themoviedb.org/3/configuration', { headers: { Authorization: `Bearer ${key}` } })
        : await fetch(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(key)}`)
      if (res.ok) {
        setTmdbApiKey(key)
        setTmdbValidation('valid')
        flashSaved()
      } else {
        setTmdbValidation('invalid')
      }
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

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!activeProfile) return <Navigate to="/profiles" replace />

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

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Please select a JPEG, PNG, or WebP image.')
      return
    }

    setAvatarUploading(true)
    try {
      const { data: presignData } = await userApi.presignAvatar(file.type, file.name, profileId)
      await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      const { data: confirmData } = await userApi.confirmAvatar(presignData.cdnUrl, profileId)
      setActiveProfile({ ...activeProfile, avatarUrl: confirmData.avatarUrl } as typeof activeProfile)
      qc.invalidateQueries({ queryKey: ['profiles'] })
      flashSaved()
    } catch {
      alert('Avatar upload failed. Please try again.')
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleSelectPresetAvatar(avatarDataUrl: string) {
    setAvatarUploading(true)
    try {
      const { data: confirmData } = await userApi.confirmAvatar(avatarDataUrl, profileId)
      setActiveProfile({ ...activeProfile, avatarUrl: confirmData.avatarUrl } as typeof activeProfile)
      qc.invalidateQueries({ queryKey: ['profiles'] })
      flashSaved()
    } catch {
      alert('Failed to update avatar. Please try again.')
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleExport() {
    const data = await userApi.exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kokomovie-data-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const initials = activeProfile.name.slice(0, 2).toUpperCase()
  const hue = activeProfile.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360

  return (
    <AppLayout>
      <div className="px-6 py-8 max-w-2xl animate-fade-in flex flex-col h-full overflow-hidden">
        {/* Page Header */}
        <div className="mb-6 shrink-0">
          <h1 className="text-white text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-white/40 text-sm mt-1">Manage your profile, preferences, and API configuration.</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/[0.06] mb-6 overflow-x-auto shrink-0 scrollbar-none">
          {[
            {
              id: 'preferences',
              label: 'Preferences',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )
            },
            {
              id: 'api',
              label: 'API Configuration',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-2 4a5 5 0 110-10 5 5 0 010 10zM19 9h3m-3 3h3m-9 3h-2a2 2 0 00-2 2v3h6v-3a2 2 0 00-2-2z" />
                </svg>
              )
            },
            {
              id: 'downloads',
              label: 'Downloads',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )
            },
            {
              id: 'privacy',
              label: 'Privacy',
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
                      <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )}
                    title="Profile"
                    description="Your avatar and profile identity"
                  >
                    <div className="space-y-5">
                      <div className="flex items-center gap-5 pb-4 border-b border-white/[0.06]">
                        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                          {activeProfile.avatarUrl ? (
                            <img
                              src={activeProfile.avatarUrl}
                              alt={activeProfile.name}
                              className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white/10"
                            />
                          ) : (
                            <div
                              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-lg ring-2 ring-white/10"
                              style={{ background: `hsl(${hue}, 55%, 40%)` }}
                            >
                              {initials}
                            </div>
                          )}
                          <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {avatarUploading ? (
                              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <span className="text-white text-[10px] font-semibold uppercase tracking-wider">Custom</span>
                            )}
                          </div>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                        <div>
                          <p className="text-white font-semibold text-[15px]">{activeProfile.name}</p>
                          <p className="text-white/35 text-xs mt-0.5">Select a preset below or upload a custom image.</p>
                        </div>
                      </div>

                      {/* Preset avatar selector */}
                      <div>
                        <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Choose a Preset Avatar</p>
                        <div className="grid grid-cols-6 gap-3">
                          {PRESET_AVATARS.map((avatar) => {
                            const isSelected = activeProfile.avatarUrl === avatar.dataUrl
                            return (
                              <button
                                key={avatar.id}
                                onClick={() => handleSelectPresetAvatar(avatar.dataUrl)}
                                disabled={avatarUploading}
                                className={`aspect-square rounded-2xl p-1 bg-gradient-to-br ${avatar.gradient} relative group hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none ${
                                  isSelected ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-[#0a0a0a]' : 'opacity-60 hover:opacity-100'
                                }`}
                                title={avatar.name}
                              >
                                <div className="w-full h-full rounded-xl overflow-hidden bg-black/15 flex items-center justify-center">
                                  {avatar.svg}
                                </div>
                                {isSelected && (
                                  <div className="absolute -top-1 -right-1 bg-violet-500 text-white rounded-full p-0.5 shadow-md">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    icon={(
                      <svg className="w-5 h-5 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    title="Playback"
                    description="Language, autoplay, and content filtering"
                  >
                    <SettingRow label="Interface Language">
                      <select
                        value={prefs.language}
                        onChange={(e) => updateMutation.mutate({ language: e.target.value })}
                        className="bg-white/[0.06] border border-white/[0.12] text-white text-sm rounded-lg px-3 py-1.5 min-w-40 focus:border-violet-500 focus:outline-none transition-colors cursor-pointer"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>{l.label}</option>
                        ))}
                      </select>
                    </SettingRow>

                    <SettingRow label="Autoplay Next Episode" description="Automatically play the next episode when one ends">
                      <Toggle enabled={prefs.autoplay} onChange={() => updateMutation.mutate({ autoplay: !prefs.autoplay })} />
                    </SettingRow>

                    <SettingRow label="Maximum Maturity Rating" description="Filter content above this rating">
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

                    <SettingRow label="Default Subtitle Language" description="Language code (e.g. en, es, fr)">
                      <input
                        type="text"
                        value={prefs.subtitleDefault ?? ''}
                        placeholder="Off"
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
                    title="Application Updates"
                    description="Keep KokoMovie up to date automatically"
                  >
                    <SettingRow
                      label="Automatic Updates"
                      description="Download and install new versions."
                    >
                      <ToggleSwitch checked={autoUpdateEnabled} onChange={onToggleAutoUpdate} label="Automatic updates" />
                    </SettingRow>

                    <SettingRow
                      label="Check for Updates"
                      description="Look for a new version."
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
                          {updateCheck.status === 'checking' ? 'Checking…' : 'Check Now'}
                        </button>
                        {updateCheck.status === 'up-to-date' && (
                          <span className="text-[11px] text-emerald-300/80">You&apos;re on the latest version{updateCheck.version ? ` (v${updateCheck.version})` : ''}</span>
                        )}
                        {updateCheck.status === 'available' && (
                          <span className="text-[11px] text-violet-300">Update {updateCheck.version ? `v${updateCheck.version} ` : ''}found — downloading…</span>
                        )}
                        {updateCheck.status === 'dev' && (
                          <span className="text-[11px] text-white/40">Available only in the installed app</span>
                        )}
                        {updateCheck.status === 'error' && (
                          <span className="text-[11px] text-red-300/80">{updateCheck.message || 'Check failed'}</span>
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
                  title="API Configuration"
                  description="Connect your personal TMDB API key to browse movies and shows"
                >
                  <div className="space-y-4">
                    {/* Key input */}
                    <div>
                      <label className="text-white text-sm font-medium block mb-2">TMDB API Key</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={tmdbKeyVisible ? 'text' : 'password'}
                            value={tmdbKeyInput}
                            onChange={(e) => {
                              setTmdbKeyInput(e.target.value)
                              if (tmdbValidation !== 'idle') setTmdbValidation('idle')
                            }}
                            placeholder="Paste your TMDB API key here..."
                            spellCheck={false}
                            autoComplete="off"
                            className="w-full bg-white/[0.06] border border-white/[0.12] text-white text-sm rounded-lg pl-3 pr-10 py-2.5 focus:border-violet-500 focus:outline-none transition-colors font-mono tracking-wider"
                          />
                          <button
                            onClick={() => setTmdbKeyVisible(!tmdbKeyVisible)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                            title={tmdbKeyVisible ? 'Hide key' : 'Show key'}
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
                            Validating...
                          </span>
                        ) : 'Validate Key'}
                      </button>

                      {tmdbApiKey && (
                        <button
                          onClick={handleClearTmdbKey}
                          className="text-red-400/80 hover:text-red-300 text-sm font-medium transition-colors"
                        >
                          Remove Key
                        </button>
                      )}

                      {/* Status indicator */}
                      {tmdbValidation === 'valid' && (
                        <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium animate-fade-in">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Valid
                        </span>
                      )}
                      {tmdbValidation === 'invalid' && (
                        <span className="flex items-center gap-1.5 text-red-400 text-sm font-medium animate-fade-in">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Invalid key
                        </span>
                      )}
                    </div>

                    {/* Instructions toggle */}
                    <TmdbInstructions
                      isOpen={tmdbInstructionsOpen}
                      onToggle={() => setTmdbInstructionsOpen(!tmdbInstructionsOpen)}
                    />
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
                  title="Downloads"
                  description="Where downloaded content is saved"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-white text-sm">Download Location</label>
                      {downloadPath !== defaultDownloadPath && (
                        <button
                          onClick={() => {
                            setDownloadPath(defaultDownloadPath)
                            localStorage.removeItem('custom_download_path')
                            flashSaved()
                          }}
                          className="text-violet-400 hover:text-violet-300 text-xs font-medium transition-colors"
                        >
                          Reset to Default
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={downloadPath}
                        onChange={(e) => handleManualPathChange(e.target.value)}
                        className="bg-white/[0.06] border border-white/[0.12] text-white text-sm rounded-lg px-3 py-2 flex-1 focus:border-violet-500 focus:outline-none transition-colors"
                        placeholder="Default download folder"
                      />
                      <button
                        onClick={handleBrowseFolder}
                        className="bg-white/[0.08] hover:bg-white/[0.14] text-white text-sm font-medium px-4 py-2 rounded-lg transition-all duration-200 active:scale-[0.97] border border-white/[0.08]"
                      >
                        Browse...
                      </button>
                    </div>
                    <p className="text-white/30 text-[11px] leading-relaxed">
                      All downloaded movies/series segments will be saved to this folder.
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
                  title="Privacy"
                  description="Data export and privacy controls"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm">Export Your Data</p>
                      <p className="text-white/35 text-xs mt-0.5">Download a copy of all your data (GDPR compliant)</p>
                    </div>
                    <button
                      onClick={handleExport}
                      className="bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-white/80 hover:text-white px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.97]"
                    >
                      Download
                    </button>
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
