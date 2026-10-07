// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../store/settings'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState(useSettingsStore.getInitialState(), true)
})
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

describe('settings persistence after watch availability removal', () => {
  it('discards obsolete persisted country and unknown properties during hydration', async () => {
    localStorage.setItem('km-settings', JSON.stringify({ version: 0, state: {
      watchCountry: 'US', legacySetting: 'obsolete', tmdbApiKey: 'old-secret', tmdbKeyHydrated: true,
    } }))
    await useSettingsStore.persist.rehydrate()

    const state = useSettingsStore.getState()
    expect(state).not.toHaveProperty('watchCountry')
    expect(state).not.toHaveProperty('legacySetting')
    expect(state.tmdbApiKey).toBe('')
    expect(state.tmdbKeyHydrated).toBe(false)
    expect(JSON.parse(localStorage.getItem('km-settings')!).state).toEqual({})
  })

  it('keeps account keychain updates while excluding credentials from localStorage', async () => {
    const setTmdbApiKey = vi.fn().mockResolvedValue(undefined)
    const clearTmdbApiKey = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { setTmdbApiKey, clearTmdbApiKey } })

    useSettingsStore.getState().setTmdbApiKey('current-secret')
    useSettingsStore.getState().setTmdbKeyHydrated(true)
    expect(useSettingsStore.getState().tmdbApiKey).toBe('current-secret')
    expect(setTmdbApiKey).toHaveBeenCalledWith('local', 'current-secret')
    expect(JSON.parse(localStorage.getItem('km-settings')!).state).toEqual({})
    useSettingsStore.getState().clearTmdbApiKey()
    expect(clearTmdbApiKey).toHaveBeenCalledWith('local')
    expect(useSettingsStore.getState().tmdbApiKey).toBe('')
  })
})
