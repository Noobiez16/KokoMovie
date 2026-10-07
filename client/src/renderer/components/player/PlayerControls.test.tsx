// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerControls } from './PlayerControls'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => ({
  'player.quality': 'Quality', 'player.auto': 'Auto', 'player.qualityUnavailable': 'Unavailable',
  'player.playbackSettings': 'Playback settings',
}[key] ?? key) }) }))

type Props = ComponentProps<typeof PlayerControls>
const base: Props = {
  hls: null, isPlaying: true, isMuted: false, volume: 1, currentTime: 0, duration: 100, buffered: 10,
  currentLevel: -1, levels: [], subtitleTracks: [], currentSubtitle: -1, subtitleSize: 'medium', subtitleOffset: 0,
  introEndSecs: null, creditsStartSecs: null, onPlayPause: vi.fn(), onMute: vi.fn(), onVolumeChange: vi.fn(),
  onSeek: vi.fn(), onLevelChange: vi.fn(), onSubtitleChange: vi.fn(), onSubtitleSizeChange: vi.fn(),
  onSubtitleOffsetChange: vi.fn(), onFullscreen: vi.fn(),
}
afterEach(() => { cleanup(); vi.clearAllMocks() })
function openQuality() {
  fireEvent.click(screen.getByRole('button', { name: 'Playback settings' }))
  fireEvent.click(screen.getByRole('button', { name: /^Quality.+/ }))
}
describe('actual video quality controls', () => {
  it('keeps AUTO for an HLS manifest with unspecified resolution, without inventing tiers', () => {
    render(<PlayerControls {...base} hls={{} as Props['hls']} levels={[{ height: 0, bitrate: 1 }]} />)
    openQuality()
    expect(screen.getByRole('button', { name: 'Auto ✓' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^0p/ })).toBeNull()
    expect((screen.getByRole('button', { name: '720p Unavailable' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '1080p Unavailable' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it.each([720, 1080])('shows measured direct %ip without offering an upscale', (height) => {
    render(<PlayerControls {...base} decodedHeight={height} />)
    fireEvent.click(screen.getByRole('button', { name: 'Playback settings' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Quality.*${height}p`) }))
    const selected = screen.getByRole('button', { name: `${height}p ✓` }) as HTMLButtonElement
    expect(selected.disabled).toBe(true)
    expect(selected.getAttribute('aria-pressed')).toBe('true')
    const absent = screen.getByRole('button', { name: `${height === 720 ? 1080 : 720}p Unavailable` }) as HTMLButtonElement
    expect(absent.disabled).toBe(true)
    fireEvent.click(absent); fireEvent.click(selected)
    expect(base.onLevelChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Auto/ })).toBeNull()
  })
  it('waits for direct metadata instead of guessing a resolution', () => {
    render(<PlayerControls {...base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Playback settings' }))
    expect(screen.queryByRole('button', { name: /^Quality/ })).toBeNull()
  })
  it('keeps all actual HLS tiers and maps selection to original indices', () => {
    render(<PlayerControls {...base} hls={{} as Props['hls']} currentLevel={2}
      levels={[{ height: 1080, bitrate: 4 }, { height: 360, bitrate: 1 }, { height: 720, bitrate: 2 }, { height: 2160, bitrate: 8 }]} />)
    openQuality()
    expect(screen.getByRole('button', { name: '720p ✓' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '360p' }))
    expect(base.onLevelChange).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: /^Quality.+/ }))
    fireEvent.click(screen.getByRole('button', { name: '2160p' }))
    expect(base.onLevelChange).toHaveBeenLastCalledWith(3)
  })
  it.each([720, 1080])('disables the missing HLS tier beside real %ip', (height) => {
    render(<PlayerControls {...base} hls={{} as Props['hls']} levels={[{ height, bitrate: 1 }]} />)
    openQuality()
    const unavailable = screen.getByRole('button', { name: `${height === 720 ? 1080 : 720}p Unavailable` }) as HTMLButtonElement
    expect(unavailable.disabled).toBe(true)
    fireEvent.click(unavailable)
    expect(base.onLevelChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: `${height}p` }))
    expect(base.onLevelChange).toHaveBeenCalledWith(0)
  })
  it('presents decoded AUTO resolution while keeping automatic intent', () => {
    render(<PlayerControls {...base} hls={{} as Props['hls']} decodedHeight={720} levels={[{ height: 720, bitrate: 1 }]} />)
    openQuality()
    const auto = screen.getByRole('button', { name: 'Auto (720p) ✓' })
    expect(auto.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '720p' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(auto)
    expect(base.onLevelChange).toHaveBeenCalledWith(-1)
  })
  it('omits zero-resolution HLS entries and keeps unknown AUTO honest', () => {
    render(<PlayerControls {...base} hls={{} as Props['hls']} levels={[{ height: 0, bitrate: 1 }, { height: 720, bitrate: 2 }]} />)
    openQuality()
    expect(screen.queryByRole('button', { name: /^0p/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Auto ✓' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '720p' }))
    expect(base.onLevelChange).toHaveBeenCalledWith(1)
  })
})
