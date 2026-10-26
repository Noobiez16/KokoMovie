// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoPlayer } from '../../components/player/VideoPlayer'

const state = vi.hoisted(() => ({ instances: [] as any[], controls: null as any, getStream: vi.fn(), resolveTorrent: vi.fn(), registerHeaders: vi.fn(), cancelRequest: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../api/providers', () => ({ providersApi: { list: async () => [], registerStreamHeaders: state.registerHeaders, getStream: state.getStream, cancelRequest: state.cancelRequest }, torrentApi: { resolve: state.resolveTorrent } }))
vi.mock('../../api/playback', () => ({ playbackApi: { heartbeat: async () => {}, reportQuality: async () => {} } }))
vi.mock('../../components/player/PlayerControls', () => ({ PlayerControls: (props: any) => {
  state.controls = props
  return <><output data-testid="quality">{props.currentLevel}</output><button onClick={props.onFullscreen}>Fullscreen</button></>
} }))
vi.mock('hls.js', () => {
  class MockHls {
    static isSupported = () => true
    static Events = { FRAG_LOADING: 'fragment-loading', MANIFEST_PARSED: 'manifest', SUBTITLE_TRACKS_UPDATED: 'subtitles', AUDIO_TRACKS_UPDATED: 'audio', AUDIO_TRACK_SWITCHED: 'audioswitch', LEVEL_SWITCHED: 'level', ERROR: 'error' }
    static ErrorDetails = { FRAG_LOAD_ERROR: 'fragLoadError', KEY_LOAD_ERROR: 'keyLoadError', KEY_LOAD_TIMEOUT: 'keyLoadTimeOut' }; static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' }
    currentLevel = -1; subtitleTrack = -1; config: any; media: any; url = ''; events = new Map(); destroy = vi.fn(); startLoad = vi.fn(); stopLoad = vi.fn(); recoverMediaError = vi.fn()
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
  state.getStream.mockReset(); state.resolveTorrent.mockReset(); state.cancelRequest.mockReset()
  state.registerHeaders.mockReset().mockResolvedValue(undefined)
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
afterEach(() => { cleanup(); if (vi.isFakeTimers()) vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })
function parse() {
  const hls = state.instances[0]
  act(() => hls.emit('manifest', { levels: [{ width: 1280, height: 720, bitrate: 1500000 }, { width: 1920, height: 1080, bitrate: 4000000 }] }))
  return hls
}

describe('actual video quality lifecycle', () => {
  it('retries a failed provider with a new media lifecycle and preserves the last playback position', async () => {
    state.getStream.mockResolvedValue({ providerId: 'original', providerName: 'Original', streams: [{ url: session.manifestUrl, quality: '1080p' }] })
    const view = render(<VideoPlayer {...props} content={{ ...content, tmdbId: 123 }} session={{ ...session, manifestUrl: 'https://fixture.invalid/video.mp4' }} initialProviderId="original" />)
    const video = view.container.querySelector('video')!
    video.currentTime = 45
    fireEvent.timeUpdate(video)
    fireEvent.error(video)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'common.retry' })); await Promise.resolve(); await Promise.resolve() })
    expect(state.getStream).toHaveBeenCalledWith('original', expect.objectContaining({ tmdbId: 123 }))
    expect(state.instances.at(-1).config.startPosition).toBe(45)
    expect(state.controls.switchingSource).toBe(false)
  })

  it('prefers a release’s sole declared language and labels the audio actually resolved', async () => {
    state.resolveTorrent.mockResolvedValue({ url: 'http://localhost:1234/t/movie.mp4?kmc=fixture', audioLang: 'es', transcoded: false })
    render(<VideoPlayer {...props} initialProviderId="original" allStreams={[{ providerId: 'p2p-spanish', providerName: 'Spanish', streams: [{ url: 'magnet:?xt=urn:btih:fixture', quality: '1080p', audioLangs: ['spa'] }] }]} />)
    act(() => state.instances[0].emit('audio', { audioTracks: [{ id: 0, lang: 'en', name: 'English' }] }))
    await act(async () => { await state.controls.onSourceChange('p2p-spanish') })
    expect(state.resolveTorrent).toHaveBeenCalledWith('magnet:?xt=urn:btih:fixture', 'es')
    expect(state.controls.audioTracks).toEqual([{ id: -1, name: 'Spanish', lang: 'es' }])
    expect(state.controls.currentAudioTrack).toBe(-1)
  })

  it('skips a dub release whose resolved audio does not match and plays the next genuine dub', async () => {
    state.resolveTorrent.mockResolvedValueOnce({ url: 'http://localhost:1234/t/wrong.mp4', audioLang: 'en' })
      .mockResolvedValueOnce({ url: 'http://localhost:1234/t/right.mp4?kmc=fixture', audioLang: 'es', transcoded: true })
    const view = render(<VideoPlayer {...props} initialProviderId="original" allStreams={['wrong', 'right'].map(id => ({ providerId: `p2p-${id}`, providerName: id, streams: [{ url: `magnet:?xt=${id}`, quality: '1080p', audioLangs: ['es'] }] }))} />)
    await act(async () => { state.controls.onCrossSourceAudio('es', 'p2p-wrong'); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(state.resolveTorrent).toHaveBeenCalledTimes(2)
    expect(state.controls.activeSourceId).toBe('p2p-right')
    expect(state.controls.audioTracks).toEqual([{ id: -1, name: 'Spanish', lang: 'es' }])
    expect(view.container.querySelector('video')!.src).toContain('/t/right.mp4?kmc=fixture')
    expect(state.controls.switchingSource).toBe(false)
  })

  it('commits an already collected provider immediately even if legacy header registration never replies', async () => {
    state.registerHeaders.mockImplementation(() => new Promise(() => {}))
    render(<VideoPlayer {...props} initialProviderId="original" allStreams={[{ providerId: 'next', providerName: 'Next', streams: [{ url: 'https://fixture.invalid/next.m3u8', quality: '1080p', headers: { Referer: 'https://fixture.invalid/' } }] }]} />)
    await act(async () => { await state.controls.onSourceChange('next') })
    expect(state.instances.at(-1).url).toBe('https://fixture.invalid/next.m3u8')
    expect(state.controls.switchingSource).toBe(false)
    expect(state.getStream).not.toHaveBeenCalled()
  })

  it('clears a rejected torrent switch and resumes the previous working video', async () => {
    state.resolveTorrent.mockRejectedValue(new Error('No peers'))
    const view = render(<VideoPlayer {...props} initialProviderId="original" allStreams={[{ providerId: 'p2p-dead', providerName: 'Torrent', streams: [{ url: 'magnet:?xt=urn:btih:fixture', quality: '1080p' }] }]} />)
    const video = view.container.querySelector('video')!
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    fireEvent.playing(video)
    const original = state.instances[0]
    await act(async () => { await state.controls.onSourceChange('p2p-dead') })
    expect(state.controls.switchingSource).toBe(false)
    expect(state.controls.activeSourceId).toBe('original')
    expect(original.destroy).not.toHaveBeenCalled()
    expect(original.startLoad).toHaveBeenCalledOnce()
    expect(screen.queryByText('player.loadingVideo')).toBeNull()
  })

  it('restores the outgoing loader without unpausing a paused video when switching fails', async () => {
    state.resolveTorrent.mockRejectedValue(new Error('No peers'))
    render(<VideoPlayer {...props} initialProviderId="original" allStreams={[{ providerId: 'p2p-dead', providerName: 'Torrent', streams: [{ url: 'magnet:?xt=urn:btih:fixture', quality: '1080p' }] }]} />)
    const original = state.instances[0]
    await act(async () => { await state.controls.onSourceChange('p2p-dead') })
    expect(original.stopLoad).toHaveBeenCalledOnce()
    expect(original.startLoad).toHaveBeenCalledOnce()
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(state.controls.activeSourceId).toBe('original')
    expect(state.controls.switchingSource).toBe(false)
  })

  it('cancels a pending provider, restores playback and ignores its late reply', async () => {
    let complete!: (value: unknown) => void
    state.getStream.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const view = render(<VideoPlayer {...props} content={{ ...content, tmdbId: 123 }} initialProviderId="original" />)
    const video = view.container.querySelector('video')!
    Object.defineProperty(video, 'paused', { configurable: true, value: false }); fireEvent.playing(video)
    let pending!: Promise<unknown>
    await act(async () => { pending = state.controls.onSourceChange('slow') })
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    await act(async () => { await pending; complete({ providerId: 'slow', providerName: 'Slow', streams: [{ url: 'https://fixture.invalid/late.m3u8' }] }); await Promise.resolve() })
    expect(state.controls.activeSourceId).toBe('original')
    expect(state.controls.switchingSource).toBe(false)
    expect(state.cancelRequest).toHaveBeenCalled()
    expect(screen.queryByText('player.streamError')).toBeNull()
    expect(state.instances).toHaveLength(1)
  })

  it('does not let a previous title’s pending switch overwrite a new playback session', async () => {
    let complete!: (value: unknown) => void
    state.getStream.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const view = render(<VideoPlayer {...props} content={{ ...content, tmdbId: 123 }} />)
    let pending!: Promise<unknown>
    await act(async () => { pending = state.controls.onSourceChange('slow') })
    view.rerender(<VideoPlayer {...props} content={{ ...content, id: 'next-title', tmdbId: 124 }} session={{ ...session, sessionId: 'new-session', manifestUrl: 'https://fixture.invalid/new-title.m3u8' }} />)
    await act(async () => { await pending; complete({ providerId: 'slow', providerName: 'Slow', streams: [{ url: 'https://fixture.invalid/late.m3u8' }] }); await Promise.resolve() })
    expect(state.instances.at(-1).url).toBe('https://fixture.invalid/new-title.m3u8')
    expect(state.controls.switchingSource).toBe(false)
  })

  it('ends loading for a pinned source that never produces a first frame', async () => {
    vi.useFakeTimers()
    render(<VideoPlayer {...props} initialProviderId="original" allStreams={[{ providerId: 'pinned', providerName: 'Pinned', streams: [{ url: 'https://fixture.invalid/pinned.m3u8', quality: '4K' }] }]} />)
    await act(async () => { await state.controls.onSourceChange('pinned') })
    await act(async () => { await vi.advanceTimersByTimeAsync(13000) })
    expect(screen.getByText('player.sourceNotResponding')).toBeTruthy()
    expect(screen.queryByText('player.loadingVideo')).toBeNull()
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeTruthy()
    expect(state.getStream).not.toHaveBeenCalled()
  })

  it('observes concurrent video/audio fragment progress but still applies the first-frame cap', async () => {
    vi.useFakeTimers()
    render(<VideoPlayer {...props} allStreams={[{ providerId: 'pinned', providerName: 'Pinned', streams: [{ url: 'https://fixture.invalid/pinned.m3u8', quality: '4K' }] }]} />)
    await act(async () => { await state.controls.onSourceChange('pinned') })
    const stats = { loaded: 0 }
    act(() => state.instances.at(-1).emit('fragment-loading', { frag: { stats } }))
    act(() => state.instances.at(-1).emit('fragment-loading', { frag: { stats: { loaded: 1024 } } }))
    for (let index = 0; index < 4; index++) {
      stats.loaded += 1024
      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
      expect(screen.queryByText('player.streamError')).toBeNull()
    }
    stats.loaded += 1024
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByText('player.sourceNotResponding')).toBeTruthy()
  })

  it('shows a Play action instead of a permanent spinner when autoplay is denied', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    const view = render(<VideoPlayer {...props} session={{ ...session, manifestUrl: 'https://fixture.invalid/video.mp4' }} />)
    const video = view.container.querySelector('video')!
    await act(async () => { fireEvent.loadedMetadata(video); await Promise.resolve() })
    expect(screen.getByRole('button', { name: /common.play/ })).toBeTruthy()
    expect(screen.queryByText('player.loadingVideo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /common.play/ }))
    fireEvent.playing(video)
    expect(screen.queryByRole('button', { name: /common.play/ })).toBeNull()
  })

  it('leaves nonfatal fragment recovery to hls.js instead of restarting its loader', () => {
    render(<VideoPlayer {...props} />)
    const hls = state.instances[0]
    act(() => hls.emit('error', { type: 'networkError', details: 'fragLoadError', fatal: false }))
    expect(hls.startLoad).not.toHaveBeenCalled()
    expect(hls.recoverMediaError).not.toHaveBeenCalled()
  })
  it('keeps the CAM warning visible even when the video offers a 1080p encoded variant', () => {
    render(<VideoPlayer {...props} initialProviderId="camera" sourceStatuses={[{
      providerId: 'camera', providerName: 'Camera', state: 'available',
      qualityInfo: { resolution: 1080, resolutionLabel: '1080p', releaseType: 'cam', confidence: 'inferred', displayLabel: 'CAM', mediaValidated: true },
    }]} />)
    parse()
    expect(screen.getByRole('alert').textContent).toBe('player.camNotice')
    expect(state.controls.levels.some((level: { height: number }) => level.height === 1080)).toBe(true)
  })
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
