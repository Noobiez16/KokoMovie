import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuthStore } from './auth'

interface SettingsState {
  tmdbApiKey: string

  setTmdbApiKey: (key: string) => void
  clearTmdbApiKey: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      tmdbApiKey: '',

      setTmdbApiKey: (tmdbApiKey) => {
        set({ tmdbApiKey })
        const accountId = useAuthStore.getState().account?.id
        if (accountId && window.electronAPI) {
          window.electronAPI.setTmdbApiKey(accountId, tmdbApiKey).catch(() => {})
        }
      },
      clearTmdbApiKey: () => {
        set({ tmdbApiKey: '' })
        const accountId = useAuthStore.getState().account?.id
        if (accountId && window.electronAPI) {
          window.electronAPI.clearTmdbApiKey(accountId).catch(() => {})
        }
      },
    }),
    {
      name: 'km-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
