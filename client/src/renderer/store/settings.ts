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
      // Never persist the TMDB key to localStorage — it is loaded per-account
      // from the OS keychain via the useEffect in App.tsx. Persisting it here
      // would leak user A's key to user B when they log in on the same machine.
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tmdbApiKey, ...rest } = state
        return rest
      },
    },
  ),
)
