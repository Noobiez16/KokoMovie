import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SettingsState {
  tmdbApiKey: string

  setTmdbApiKey: (key: string) => void
  clearTmdbApiKey: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      tmdbApiKey: '',

      setTmdbApiKey: (tmdbApiKey) => set({ tmdbApiKey }),
      clearTmdbApiKey: () => set({ tmdbApiKey: '' }),
    }),
    {
      name: 'km-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
