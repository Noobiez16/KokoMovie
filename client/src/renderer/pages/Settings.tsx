import { useState, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { userApi, type Preferences } from '../api/user'
import { AppLayout } from '../components/layout/AppLayout'

const LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'pt-BR', label: 'Português (BR)' },
]

const RATINGS = ['G', 'PG', 'PG-13', 'R', 'TV-MA'] as const

export function SettingsPage() {
  const { isAuthenticated, activeProfile, setActiveProfile } = useAuthStore()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [avatarUploading, setAvatarUploading] = useState(false)

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
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
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
      <div className="px-6 py-8 max-w-2xl">
        <h1 className="text-white text-2xl font-bold mb-8">Profile Settings</h1>

        {/* Avatar */}
        <section className="mb-8">
          <h2 className="text-white/40 text-xs uppercase tracking-widest mb-4">Profile Picture</h2>
          <div className="flex items-center gap-6">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              {activeProfile.avatarUrl ? (
                <img
                  src={activeProfile.avatarUrl}
                  alt={activeProfile.name}
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl"
                  style={{ background: `hsl(${hue}, 60%, 45%)` }}
                >
                  {initials}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {avatarUploading
                  ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <span className="text-white text-xs">Change</span>
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
              <p className="text-white font-medium">{activeProfile.name}</p>
              <p className="text-white/40 text-sm mt-0.5">Click avatar to upload a new image</p>
            </div>
          </div>
        </section>

        {/* Preferences */}
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
        ) : (
          <>
            <section className="mb-8 space-y-4">
              <h2 className="text-white/40 text-xs uppercase tracking-widest mb-4">Playback</h2>

              {/* Language */}
              <div className="flex items-center justify-between">
                <label className="text-white text-sm">Interface Language</label>
                <select
                  value={prefs.language}
                  onChange={(e) => updateMutation.mutate({ language: e.target.value })}
                  className="bg-km-card border border-white/20 text-white text-sm rounded px-3 py-1.5 min-w-40"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>

              {/* Autoplay */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm">Autoplay Next Episode</p>
                  <p className="text-white/40 text-xs mt-0.5">Automatically play the next episode</p>
                </div>
                <button
                  onClick={() => updateMutation.mutate({ autoplay: !prefs.autoplay })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${prefs.autoplay ? 'bg-km-accent' : 'bg-white/20'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs.autoplay ? 'translate-x-5.5 left-0.5' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Maturity Rating */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm">Maximum Maturity Rating</p>
                  <p className="text-white/40 text-xs mt-0.5">Filter content above this rating</p>
                </div>
                <select
                  value={prefs.maturityRating}
                  onChange={(e) => updateMutation.mutate({ maturityRating: e.target.value as typeof RATINGS[number] })}
                  className="bg-km-card border border-white/20 text-white text-sm rounded px-3 py-1.5"
                >
                  {RATINGS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Subtitle Default */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm">Default Subtitle Language</p>
                  <p className="text-white/40 text-xs mt-0.5">Language code (e.g. en, es, fr)</p>
                </div>
                <input
                  type="text"
                  value={prefs.subtitleDefault ?? ''}
                  placeholder="Off"
                  maxLength={10}
                  onChange={(e) => updateMutation.mutate({ subtitleDefault: e.target.value || null })}
                  className="bg-km-card border border-white/20 text-white text-sm rounded px-3 py-1.5 w-24 text-center"
                />
              </div>
            </section>

            {saveStatus === 'saved' && (
              <p className="text-green-400/80 text-sm mb-4">Preferences saved.</p>
            )}
            {saveStatus === 'error' && (
              <p className="text-red-400/80 text-sm mb-4">Failed to save. Please try again.</p>
            )}
          </>
        )}

        {/* GDPR */}
        <section className="border-t border-white/10 pt-8">
          <h2 className="text-white/40 text-xs uppercase tracking-widest mb-4">Privacy</h2>
          <button
            onClick={handleExport}
            className="bg-km-card border border-white/20 text-white/70 hover:text-white px-6 py-2.5 rounded text-sm transition-colors"
          >
            Download My Data (GDPR Export)
          </button>
        </section>
      </div>
    </AppLayout>
  )
}
