import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuthStore } from './auth'

interface SettingsState {
  tmdbApiKey: string
  // True once the per-account key has been loaded from the OS keychain on
  // login (see App.tsx). Lets the UI distinguish "still loading the key" from
  // "this account has no key", so the API-key-required screen never flashes.
  tmdbKeyHydrated: boolean

  setTmdbApiKey: (key: string) => void
  clearTmdbApiKey: () => void
  setTmdbKeyHydrated: (v: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      tmdbApiKey: '',
      tmdbKeyHydrated: false,

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
      setTmdbKeyHydrated: (tmdbKeyHydrated) => set({ tmdbKeyHydrated }),
    }),
    {
      name: 'km-settings',
      storage: createJSONStorage(() => localStorage),
      // Never persist the TMDB key to localStorage — it is loaded per-account
      // from the OS keychain via the useEffect in App.tsx. Persisting it here
      // would leak user A's key to user B when they log in on the same machine.
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tmdbApiKey, tmdbKeyHydrated, ...rest } = state
        return rest
      },
    },
  ),
)
