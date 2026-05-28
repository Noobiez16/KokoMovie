import { useState, useRef, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'
import { userApi, type Preferences } from '../api/user'
import { AppLayout } from '../components/layout/AppLayout'

const LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'pt-BR', label: 'Português (BR)' },
]

const RATINGS = ['G', 'PG', 'PG-13', 'R', 'TV-MA'] as const

// ─── Reusable Components ─────────────────────────────────────────────────────

function SectionCard({ icon, title, description, children }: {
  icon: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white/[0.04] backdrop-blur-md rounded-2xl border border-white/[0.08] p-6 transition-all duration-300 hover:border-white/[0.12]">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-lg">{icon}</span>
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
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl backdrop-blur-lg transition-all duration-300 animate-slide-up ${
      status === 'saved' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' :
      status === 'error' ? 'bg-red-500/20 border border-red-500/30 text-red-300' :
      'bg-white/10 border border-white/20 text-white/70'
    }`}>
      {status === 'saved' && '✓ Settings saved'}
      {status === 'error' && '✕ Failed to save. Try again.'}
      {status === 'saving' && '⏳ Saving...'}
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
    }
  }, [])

  const flashSaved = useCallback(() => {
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2500)
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
      const res = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(key)}`)
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
    } catch {
      alert('Avatar upload failed. Please try again.')
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
      <div className="px-6 py-8 max-w-2xl animate-fade-in">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-white text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-white/40 text-sm mt-1">Manage your profile, preferences, and API configuration.</p>
        </div>

        <div className="space-y-5">
          {/* ── Profile ────────────────────────────────────────────────── */}
          <SectionCard icon="👤" title="Profile" description="Your profile picture and identity">
            <div className="flex items-center gap-5">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                {activeProfile.avatarUrl ? (
                  <img
                    src={activeProfile.avatarUrl}
                    alt={activeProfile.name}
                    className="w-[72px] h-[72px] rounded-2xl object-cover ring-2 ring-white/10"
                  />
                ) : (
                  <div
                    className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-white font-bold text-xl ring-2 ring-white/10"
                    style={{ background: `hsl(${hue}, 55%, 40%)` }}
                  >
                    {initials}
                  </div>
                )}
                <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {avatarUploading
                    ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <span className="text-white text-xs font-medium">Change</span>
                  }
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
                <p className="text-white font-medium text-[15px]">{activeProfile.name}</p>
                <p className="text-white/35 text-xs mt-0.5">Click avatar to upload a new picture</p>
              </div>
            </div>
          </SectionCard>

          {/* ── Playback ───────────────────────────────────────────────── */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <SectionCard icon="🎬" title="Playback" description="Language, autoplay, and content filtering">
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

              {/* ── Downloads ───────────────────────────────────────────── */}
              <SectionCard icon="📥" title="Downloads" description="Where downloaded content is saved">
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

              {/* ── API Configuration ──────────────────────────────────── */}
              <SectionCard icon="🔑" title="API Configuration" description="Connect your personal TMDB API key to browse movies and shows">
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

              {/* ── Privacy ────────────────────────────────────────────── */}
              <SectionCard icon="🔒" title="Privacy" description="Data export and privacy controls">
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
            </>
          )}
        </div>

        {/* Footer spacer */}
        <div className="h-12" />
      </div>

      <SaveToast status={saveStatus} />
    </AppLayout>
  )
}
