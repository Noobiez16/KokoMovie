import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfiles, useCreateProfile } from '../hooks/useProfiles'
import { useAuthStore } from '../store/auth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import type { Profile } from '../api/user'

const AVATAR_COLORS = [
  'bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-purple-600',
  'bg-orange-500', 'bg-pink-600', 'bg-teal-600', 'bg-yellow-600',
]

function ProfileAvatar({ profile, index }: { profile: Profile; index: number }) {
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length] ?? 'bg-gray-600'
  return (
    <div className={`w-full aspect-square rounded-md ${color} flex items-center justify-center overflow-hidden`}>
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-4xl font-bold text-white select-none">
          {profile.name[0]?.toUpperCase() ?? '?'}
        </span>
      )}
    </div>
  )
}

export function ProfileSelectPage() {
  const navigate = useNavigate()
  const setActiveProfile = useAuthStore((s) => s.setActiveProfile)
  const { data: profiles, isLoading } = useProfiles()
  const { mutate: createProfile, isPending: creating } = useCreateProfile()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [isKids, setIsKids] = useState(false)

  const handleSelectProfile = (profile: Profile) => {
    setActiveProfile(profile)
    navigate('/home')
  }

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    createProfile({ name: newName.trim(), isKids }, {
      onSuccess: () => {
        setShowCreate(false)
        setNewName('')
        setIsKids(false)
      },
    })
  }

  const canAddMore = (profiles?.length ?? 0) < 5

  return (
    <div className="min-h-screen bg-km-bg flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-semibold text-center mb-10">Who's watching?</h1>

        {isLoading ? (
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 justify-items-center mb-10">
            {profiles?.map((profile, i) => (
              <button
                key={profile.id}
                onClick={() => handleSelectProfile(profile)}
                className="group w-28 text-center space-y-2 focus:outline-none"
                aria-label={`Select profile ${profile.name}`}
              >
                <div className="transition-transform duration-150 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-white rounded-md">
                  <ProfileAvatar profile={profile} index={i} />
                </div>
                <p className="text-sm text-white/70 group-hover:text-white transition-colors truncate">
                  {profile.name}
                </p>
                {profile.isKids && (
                  <span className="inline-block text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">Kids</span>
                )}
              </button>
            ))}

            {canAddMore && !showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="group w-28 text-center space-y-2 focus:outline-none"
                aria-label="Add profile"
              >
                <div className="w-full aspect-square rounded-md bg-km-surface border-2 border-dashed border-km-border flex items-center justify-center transition-all group-hover:border-white/50">
                  <span className="text-3xl text-km-text-muted group-hover:text-white">+</span>
                </div>
                <p className="text-sm text-white/40 group-hover:text-white transition-colors">Add Profile</p>
              </button>
            )}
          </div>
        )}

        {showCreate && (
          <div className="max-w-sm mx-auto bg-km-surface rounded-lg p-6 border border-km-border animate-slide-up">
            <h2 className="text-lg font-semibold mb-4">New profile</h2>
            <form onSubmit={handleCreateProfile} className="space-y-4">
              <Input
                label="Profile name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Alex"
                maxLength={50}
                autoFocus
                required
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isKids}
                  onChange={(e) => setIsKids(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-white/70">Kids profile</span>
              </label>
              <div className="flex gap-3">
                <Button type="submit" loading={creating} className="flex-1">
                  Create
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
