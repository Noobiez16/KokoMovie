// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoPlayer } from '../../components/player/VideoPlayer'

const state = vi.hoisted(() => ({ instances: [] as any[], controls: null as any }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../api/providers', () => ({ providersApi: { list: async () => [], registerStreamHeaders: async () => {} }, torrentApi: {} }))
vi.mock('../../api/playback', () => ({ playbackApi: { heartbeat: async () => {}, reportQuality: async () => {} } }))
vi.mock('../../components/player/PlayerControls', () => ({ PlayerControls: (props: any) => {
  state.controls = props
  return <><output data-testid="quality">{props.currentLevel}</output><button onClick={props.onFullscreen}>Fullscreen</button></>
} }))
vi.mock('hls.js', () => {
  class MockHls {
    static isSupported = () => true
    static Events = { MANIFEST_PARSED: 'manifest', SUBTITLE_TRACKS_UPDATED: 'subtitles', AUDIO_TRACKS_UPDATED: 'audio', AUDIO_TRACK_SWITCHED: 'audioswitch', LEVEL_SWITCHED: 'level', ERROR: 'error' }
    static ErrorDetails = {}; static ErrorTypes = {}
    currentLevel = -1; subtitleTrack = -1; config: any; media: any; url = ''; events = new Map(); destroy = vi.fn(); startLoad = vi.fn()
    constructor(config: any) { this.config = config; state.instances.push(this) }
    loadSource(url: string) { this.url = url }
    attachMedia(media: any) { this.media = media }
    on(event: string, callback: any) { this.events.set(event, callback) }
    emit(event: string, data: any) { this.events.get(event)?.(event, data) }
  }
  return { default: MockHls }
})

const content = { id: 'diagnostic-film', type: 'movie', title: 'Diagnostic', durationMins: 0, seasons: [], genres: [], cast: [] } as any
const session = { sessionId: 'same-session', manifestUrl: 'https://fixture.invalid/master.m3u8', drmKeyId: null, expiresIn: 14400 }
const props = { content, episode: null, session, profileId: 'local', onClose: vi.fn(), offlineSubtitles: [], allStreams: [], sourceStatuses: [] }

beforeEach(() => {
  state.instances = []; state.controls = null
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  Object.defineProperty(HTMLMediaElement.prototype, 'textTracks', { configurable: true, get: () => ({ length: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: vi.fn(function(this: HTMLElement) {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this }); document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve()
  }) })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: vi.fn(() => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null }); document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve()
  }) })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
function parse() {
  const hls = state.instances[0]
  act(() => hls.emit('manifest', { levels: [{ width: 1280, height: 720, bitrate: 1500000 }, { width: 1920, height: 1080, bitrate: 4000000 }] }))
  return hls
}

describe('actual video quality lifecycle', () => {
  it('observes the current video after the stream error panel replaces the element', () => {
    const view = render(<VideoPlayer {...props} session={{ ...session, manifestUrl: 'https://fixture.invalid/video.mp4' }} />)
    const previous = view.container.querySelector('video')!
    fireEvent.error(previous)
    expect(view.container.querySelector('video')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /player.chooseAnotherSource/ }))
    const video = view.container.querySelector('video')!
    expect(video).not.toBe(previous)
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    fireEvent.loadedMetadata(video)
    expect(state.controls.decodedHeight).toBe(1080)
  })
  it('retains genuine height-only HLS metadata when the width is unspecified', () => {
    render(<VideoPlayer {...props} />)
    act(() => state.instances[0].emit('manifest', { levels: [{ height: 720, bitrate: 1 }] }))
    expect(state.controls.levels).toEqual([{ height: 720, bitrate: 1 }])
  })
  it('does not retain direct resolution while a replacement HLS manifest is pending', () => {
    const view = render(<VideoPlayer {...props} session={{ ...session, manifestUrl: 'https://fixture.invalid/video.mp4' }} />)
    const video = view.container.querySelector('video')!
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 })
    fireEvent.loadedMetadata(video)
    expect(state.controls.decodedHeight).toBe(720)
    view.rerender(<VideoPlayer {...props} />)
    expect(state.controls.decodedHeight).toBeNull()
    expect(state.controls.levels).toEqual([])
    parse()
    expect(state.controls.levels).toEqual([{ height: 720, bitrate: 1500000 }, { height: 1080, bitrate: 4000000 }])
  })
  it('classifies standard 540p without inflating it to 720p', () => {
    render(<VideoPlayer {...props} />)
    act(() => state.instances[0].emit('manifest', { levels: [{ width: 960, height: 540, bitrate: 1 }] }))
    expect(state.controls.levels).toEqual([{ height: 540, bitrate: 1 }])
  })
  it('observes intrinsic metadata and resize, ignoring window enlargement', () => {
    const view = render(<VideoPlayer {...props} session={{ ...session, manifestUrl: 'https://fixture.invalid/video.mp4' }} />)
    const video = view.container.querySelector('video')!
    expect(state.controls.decodedHeight).toBeNull()
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 })
    fireEvent.loadedMetadata(video)
    expect(state.controls.decodedHeight).toBe(720)
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    fireEvent(window, new Event('resize'))
    expect(state.controls.decodedHeight).toBe(720)
    fireEvent(video, new Event('resize'))
    expect(state.controls.decodedHeight).toBe(1080)
    fireEvent.click(screen.getByText('Fullscreen'))
    fireEvent.click(screen.getByText('Fullscreen'))
    expect(state.controls.decodedHeight).toBe(1080)
    expect(state.controls.currentLevel).toBe(-1)
    expect(video.src).toBe('https://fixture.invalid/video.mp4')
    fireEvent(video, new Event('emptied'))
    expect(state.controls.decodedHeight).toBeNull()
  })
  it('clears measured resolution and stale HLS levels on a real source change', () => {
    const view = render(<VideoPlayer {...props} />)
    parse()
    const video = view.container.querySelector('video')!
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 })
    fireEvent.loadedMetadata(video)
    expect(state.controls.decodedHeight).toBe(720)
    view.rerender(<VideoPlayer {...props} session={{ ...session, manifestUrl: 'https://fixture.invalid/other.mp4' }} />)
    expect(state.controls.decodedHeight).toBeNull()
    expect(state.controls.levels).toEqual([])
    expect(state.controls.hls).toBeNull()
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    fireEvent.loadedMetadata(video)
    expect(state.controls.decodedHeight).toBe(1080)
  })
  it('preserves media, HLS instance and manual level across DOM fullscreen entry/exit and resize', () => {
    const view = render(<VideoPlayer {...props} />)
    const hls = parse(); const video = view.container.querySelector('video')!
    video.currentTime = 24
    act(() => state.controls.onLevelChange(1))
    fireEvent.click(screen.getByText('Fullscreen'))
    act(() => window.dispatchEvent(new Event('resize')))
    expect(document.fullscreenElement).toBe(video.parentElement)
    fireEvent.click(screen.getByText('Fullscreen'))
    expect(document.fullscreenElement).toBeNull()
    expect(view.container.querySelector('video')).toBe(video)
    expect(video.currentTime).toBe(24)
    expect(state.instances).toHaveLength(1)
    expect(hls.destroy).not.toHaveBeenCalled()
    expect(hls.currentLevel).toBe(1)
    expect(screen.getByTestId('quality').textContent).toBe('1')
    expect(hls.config.startLevel).toBe(-1)
    expect(hls.config).not.toHaveProperty('capLevelToPlayerSize')
    expect(hls.config).not.toHaveProperty('autoLevelCapping')
  })
  it('preserves manual level and HLS across embedded/full mode and late mirror collection', () => {
    const view = render(<VideoPlayer {...props} />)
    const hls = parse(); const video = view.container.querySelector('video')!
    act(() => state.controls.onLevelChange(1))
    view.rerender(<VideoPlayer {...props} embedded />)
    expect(view.container.querySelector('video')).toBe(video)
    view.rerender(<VideoPlayer {...props} allStreams={[{ providerId: 'late', providerName: 'Late', streams: [] }]} sourceStatuses={[]} />)
    expect(view.container.querySelector('video')).toBe(video)
    expect(state.instances).toHaveLength(1)
    expect(hls.currentLevel).toBe(1)
    expect(screen.getByTestId('quality').textContent).toBe('1')
  })
  it('keeps AUTO intent during ABR level reports and fullscreen', () => {
    render(<VideoPlayer {...props} />)
    const hls = parse()
    act(() => hls.emit('level', { level: 1 }))
    fireEvent.click(screen.getByText('Fullscreen'))
    expect(screen.getByTestId('quality').textContent).toBe('-1')
    expect(hls.currentLevel).toBe(-1)
    expect(state.instances).toHaveLength(1)
  })
  it('preserves direct media source, position and element across DOM fullscreen', () => {
    const view = render(<VideoPlayer {...props} session={{ ...session, manifestUrl: 'https://fixture.invalid/video.mp4' }} />)
    const video = view.container.querySelector('video')!; video.currentTime = 24
    fireEvent.click(screen.getByText('Fullscreen'))
    act(() => window.dispatchEvent(new Event('resize')))
    fireEvent.click(screen.getByText('Fullscreen'))
    expect(view.container.querySelector('video')).toBe(video)
    expect(video.src).toBe('https://fixture.invalid/video.mp4')
    expect(video.currentTime).toBe(24)
    expect(state.instances).toHaveLength(0)
  })
})
