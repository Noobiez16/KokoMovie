import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Profile } from '../api/user'
import { LOCAL_PROFILE, LOCAL_PROFILE_ID } from '../lib/local-identity'

interface AccountInfo {
  id: string
  email: string
  plan: string
  mfaEnabled: boolean
}

// KokoMovie is fully local — there is no login. A single on-device identity is
// always "signed in" so the rest of the app (which keys off the active profile)
// works unchanged.
const LOCAL_ACCOUNT: AccountInfo = { id: LOCAL_PROFILE_ID, email: 'local', plan: 'basic', mfaEnabled: false }

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
      account: LOCAL_ACCOUNT,
      activeProfile: LOCAL_PROFILE,
      isAuthenticated: true,

      setAccount: (account) =>
        set({ account, isAuthenticated: account !== null }),

      setActiveProfile: (activeProfile) =>
        set({ activeProfile }),

      // No real sessions in the local build; "logout" just resets to the local identity.
      logout: () =>
        set({ account: LOCAL_ACCOUNT, activeProfile: LOCAL_PROFILE, isAuthenticated: true }),
    }),
    {
      name: 'km-auth',
      storage: createJSONStorage(() => localStorage),
      // Never persist tokens — they live in OS keychain
      partialize: (state) => ({
        account: state.account,
        activeProfile: state.activeProfile,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
