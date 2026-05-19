import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Profile } from '../api/user'

interface AccountInfo {
  id: string
  email: string
  plan: string
  mfaEnabled: boolean
}

interface AuthState {
  account: AccountInfo | null
  activeProfile: Profile | null
  isAuthenticated: boolean

  setAccount: (account: AccountInfo | null) => void
  setActiveProfile: (profile: Profile | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      account: null,
      activeProfile: null,
      isAuthenticated: false,

      setAccount: (account) =>
        set({ account, isAuthenticated: account !== null }),

      setActiveProfile: (activeProfile) =>
        set({ activeProfile }),

      logout: () =>
        set({ account: null, activeProfile: null, isAuthenticated: false }),
    }),
    {
      name: 'km-auth',
      storage: createJSONStorage(() => sessionStorage),
      // Never persist tokens — they live in OS keychain
      partialize: (state) => ({
        account: state.account,
        activeProfile: state.activeProfile,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
