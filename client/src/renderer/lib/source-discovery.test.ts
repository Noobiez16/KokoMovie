import { describe, expect, it } from 'vitest'
import {
  createInitialSourceStatuses,
  normalizeSourceDiscoveryMode,
  rankSourceStatuses,
  shouldResolveAutomaticSource,
  type ProviderSourceStatus,
} from '../../main/providers/source-discovery'
import { classifySourceQuality } from '../../main/providers/source-quality'

describe('source discovery preferences', () => {
  it('defaults unknown stored values to progressive mode', () => {
    expect(normalizeSourceDiscoveryMode(undefined)).toBe('progressive')
    expect(normalizeSourceDiscoveryMode('broken')).toBe('progressive')
    expect(normalizeSourceDiscoveryMode('complete')).toBe('complete')
  })
})

describe('provider source statuses', () => {
  it('starts every enabled provider in searching state', () => {
    expect(createInitialSourceStatuses([
      { id: 'vixsrc', name: 'VixSrc' },
      { id: 'moviesapi', name: 'MoviesAPI' },
    ])).toEqual([
      { providerId: 'vixsrc', providerName: 'VixSrc', state: 'searching' },
      { providerId: 'moviesapi', providerName: 'MoviesAPI', state: 'searching' },
    ])
  })

  it('ranks available non-CAM sources first and terminal failures last', () => {
    const status = (
      providerId: string,
      state: ProviderSourceStatus['state'],
      qualityInfo?: ProviderSourceStatus['qualityInfo'],
    ): ProviderSourceStatus => ({ providerId, providerName: providerId, state, qualityInfo })

    const ranked = rankSourceStatuses([
      status('timed-out', 'timed-out'),
      status('cam', 'available', classifySourceQuality({ url: 'https://x/cam/a.m3u8', resolution: 1080, mediaValidated: true })),
      status('searching', 'searching'),
      status('hd', 'available', classifySourceQuality({ url: 'https://x/web-dl/a.m3u8', resolution: 720, mediaValidated: true })),
      status('unavailable', 'unavailable'),
    ])

    expect(ranked.map((item) => item.providerId))
      .toEqual(['hd', 'cam', 'searching', 'unavailable', 'timed-out'])
  })

  it('starts progressively for a non-CAM source but never picks CAM while providers are searching', () => {
    const standard = classifySourceQuality({ url: 'https://x/web-dl/a.m3u8', resolution: 720, mediaValidated: true })
    const cam = classifySourceQuality({ url: 'https://x/cam/a.m3u8', resolution: 1080, mediaValidated: true })
    const searching: ProviderSourceStatus[] = [
      { providerId: 'a', providerName: 'A', state: 'available', qualityInfo: cam },
      { providerId: 'b', providerName: 'B', state: 'searching' },
    ]

    expect(shouldResolveAutomaticSource('progressive', standard, searching)).toBe(true)
    expect(shouldResolveAutomaticSource('progressive', cam, searching)).toBe(false)
    expect(shouldResolveAutomaticSource('complete', standard, searching)).toBe(false)
    expect(shouldResolveAutomaticSource('progressive', cam, searching.map((item) => item.state === 'searching' ? { ...item, state: 'unavailable' } : item))).toBe(true)
  })
})
