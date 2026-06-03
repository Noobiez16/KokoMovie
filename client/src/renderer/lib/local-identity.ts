// The single on-device identity for the fully-local app (no login).
// Kept dependency-free (only a type-only import) so it can be shared by both the
// auth store and the user API without creating an import cycle.
import type { Profile } from '../api/user'

export const LOCAL_PROFILE_ID = 'local'

export const LOCAL_PROFILE: Profile = {
  id: LOCAL_PROFILE_ID,
  accountId: 'local',
  name: 'You',
  avatarUrl: null,
  isKids: false,
  maturityRating: 'TV-MA',
  language: 'en',
  autoplay: true,
  subtitleDefault: null,
  createdAt: new Date(0).toISOString(),
}
