// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextEpisodeOverlay } from '../components/player/NextEpisodeOverlay'

const episode = {
  id: 'ep-1-1-2', seasonId: 's-1-1', contentId: 'show-1', episodeNumber: 2,
  title: 'Episode Two', description: null, durationMins: 45, s3HlsKey: null,
  s3ThumbnailKey: null, introStartSecs: null, introEndSecs: null,
  creditsStartSecs: null, airDate: null,
}

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('NextEpisodeOverlay autoplay preference', () => {
  it('keeps manual play available without starting a countdown when autoplay is off', () => {
    vi.useFakeTimers()
    const onPlay = vi.fn()
    render(<NextEpisodeOverlay nextEpisode={episode} onPlay={onPlay} onDismiss={() => {}} autoplayEnabled={false} />)
    act(() => { vi.advanceTimersByTime(20_000) })
    expect(onPlay).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /play/i }).textContent).not.toContain('10s')
    expect(screen.getByRole('button', { name: /close/i })).toBeTruthy()
  })

  it('plays once after the visible countdown when autoplay is on', () => {
    vi.useFakeTimers()
    const onPlay = vi.fn()
    render(<NextEpisodeOverlay nextEpisode={episode} onPlay={onPlay} onDismiss={() => {}} autoplayEnabled autoplayDelaySecs={3} />)
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('keeps countdown progress when the parent supplies a new callback identity', () => {
    vi.useFakeTimers()
    const first = vi.fn()
    const second = vi.fn()
    const view = render(<NextEpisodeOverlay nextEpisode={episode} onPlay={first} onDismiss={() => {}} autoplayEnabled autoplayDelaySecs={3} />)
    act(() => { vi.advanceTimersByTime(1_000) })
    view.rerender(<NextEpisodeOverlay nextEpisode={episode} onPlay={second} onDismiss={() => {}} autoplayEnabled autoplayDelaySecs={3} />)
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
