import { describe, expect, it } from 'vitest'
import { LOCAL_PROFILE, LOCAL_PROFILE_ID } from './local-identity'

describe('local identity', () => {
  it('is deterministic and account-free', () => {
    expect(LOCAL_PROFILE_ID).toBe('local')
    expect(LOCAL_PROFILE).toMatchObject({
      id: 'local',
      accountId: 'local',
      name: 'You',
      avatarUrl: null,
      isKids: false,
    })
    expect(LOCAL_PROFILE.createdAt).toBe(new Date(0).toISOString())
  })
})
