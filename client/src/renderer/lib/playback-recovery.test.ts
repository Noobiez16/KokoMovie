import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlaybackRecoveryDeadline, getPlaybackRecoveryPatch } from '../components/player/playback-recovery'

afterEach(() => vi.useRealTimers())

describe('playback recovery policy', () => {
  it('treats playing as authoritative recovery from a pending fallback', () => {
    const current = {
      initialLoading: true,
      awaitingFallback: true,
      hlsError: 'A stale error that must not cover working playback',
    }
    expect({ ...current, ...getPlaybackRecoveryPatch('playing') }).toEqual({
      initialLoading: false,
      awaitingFallback: false,
      hlsError: null,
    })
  })

  it('preserves unrelated state while settling playback recovery', () => {
    const current = {
      initialLoading: false,
      awaitingFallback: true,
      hlsError: null,
      selectedSubtitle: 'es',
    }
    expect({ ...current, ...getPlaybackRecoveryPatch('playing') }).toEqual({
      initialLoading: false,
      awaitingFallback: false,
      hlsError: null,
      selectedSubtitle: 'es',
    })
  })

  it('does not expire after playing wins at the deadline boundary', () => {
    vi.useFakeTimers()
    const deadline = new PlaybackRecoveryDeadline()
    const expired = vi.fn()

    deadline.start(expired, 8000)
    vi.setSystemTime(8000)
    deadline.markPlaying()
    vi.runOnlyPendingTimers()

    expect(expired).not.toHaveBeenCalled()
  })

  it('expires a fallback that never recovers', () => {
    vi.useFakeTimers()
    const deadline = new PlaybackRecoveryDeadline()
    const expired = vi.fn()

    deadline.start(expired, 8000)
    vi.advanceTimersByTime(8000)

    expect(expired).toHaveBeenCalledOnce()
  })
})
