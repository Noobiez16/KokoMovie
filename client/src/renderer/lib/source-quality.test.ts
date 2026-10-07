import { describe, expect, it } from 'vitest'
import {
  classifySourceQuality,
  rankProviderResults,
  selectAutomaticFallback,
} from '../../main/providers/source-quality'
import type { ProviderResult } from '../../main/providers/interface'

function result(
  providerId: string,
  qualityInfo: ReturnType<typeof classifySourceQuality>,
): ProviderResult {
  return {
    providerId,
    providerName: providerId,
    streams: [{ url: `https://cdn.example/${providerId}.m3u8`, quality: qualityInfo.resolutionLabel, qualityInfo }],
  }
}

describe('source quality classification', () => {
  it('lets an explicit CAM URL override a 1080p encoding', () => {
    expect(classifySourceQuality({
      url: 'https://cdn.example/releases/cam/master.m3u8',
      resolution: 1080,
      mediaValidated: true,
    })).toMatchObject({
      resolution: 1080,
      resolutionLabel: '1080p',
      releaseType: 'cam',
      confidence: 'inferred',
      displayLabel: 'CAM',
    })
  })

  it('uses a provider-declared telesync label ahead of resolution', () => {
    expect(classifySourceQuality({
      url: 'https://cdn.example/master.m3u8',
      resolution: 1080,
      declaredQuality: 'HDTS',
      mediaValidated: true,
    })).toMatchObject({ releaseType: 'telesync', confidence: 'declared', displayLabel: 'TS' })
  })

  it('recognizes an explicit TS quality query from the extracted stream URL', () => {
    expect(classifySourceQuality({
      url: 'https://cdn.example/master.m3u8?quality=ts',
      resolution: 1080,
      mediaValidated: true,
    })).toMatchObject({ releaseType: 'telesync', confidence: 'inferred', displayLabel: 'TS' })
  })

  it('does not present resolution-only evidence as verified release quality', () => {
    expect(classifySourceQuality({
      url: 'https://cdn.example/master.m3u8',
      resolution: 1080,
      mediaValidated: true,
    })).toMatchObject({
      releaseType: 'unknown',
      confidence: 'unknown',
      displayLabel: '1080p · Unverified',
    })
  })

  it('recognizes a declared standard release', () => {
    expect(classifySourceQuality({
      url: 'https://cdn.example/master.m3u8',
      resolution: 720,
      declaredQuality: 'WEB-DL 720p',
      mediaValidated: true,
    })).toMatchObject({
      releaseType: 'standard',
      confidence: 'declared',
      displayLabel: '720p · Declared',
    })
  })
})

describe('provider quality ranking', () => {
  it('ranks non-CAM sources by resolution, retaining CAM/TS as last resort', () => {
    const standard720 = result('standard-720', classifySourceQuality({
      url: 'https://cdn.example/web-dl/master.m3u8', resolution: 720, mediaValidated: true,
    }))
    const unknown1080 = result('unknown-1080', classifySourceQuality({
      url: 'https://cdn.example/master.m3u8', resolution: 1080, mediaValidated: true,
    }))
    const cam1080 = result('cam-1080', classifySourceQuality({
      url: 'https://cdn.example/cam/master.m3u8', resolution: 1080, mediaValidated: true,
    }))
    const queryTs1080 = result('query-ts-1080', classifySourceQuality({
      url: 'https://cdn.example/master.m3u8?quality=ts', resolution: 1080, mediaValidated: true,
    }))

    expect(rankProviderResults([cam1080, queryTs1080, unknown1080, standard720]).map((item) => item.providerId))
      .toEqual(['unknown-1080', 'standard-720', 'cam-1080', 'query-ts-1080'])
  })

  it('prefers validated media before unvalidated resolution or release claims', () => {
    const validated = result('validated', classifySourceQuality({ url: 'https://x/a', resolution: 720, mediaValidated: true }))
    const unvalidated = result('unvalidated', classifySourceQuality({ url: 'https://x/web-dl/a', resolution: 2160 }))
    const cam = result('cam', classifySourceQuality({ url: 'https://x/cam/a', resolution: 2160, mediaValidated: true }))
    expect(rankProviderResults([cam, unvalidated, validated]).map((item) => item.providerId))
      .toEqual(['validated', 'unvalidated', 'cam'])
  })

  it('uses release evidence only to break equal resolution ties and preserves stable order', () => {
    const unknown = result('unknown', classifySourceQuality({ url: 'https://x/a', resolution: 2160, mediaValidated: true }))
    const standard = result('standard', classifySourceQuality({ url: 'https://x/web-dl/a', resolution: 2160, mediaValidated: true }))
    const tied = { ...standard, providerId: 'tied' }
    expect(rankProviderResults([unknown, standard, tied]).map((item) => item.providerId))
      .toEqual(['standard', 'tied', 'unknown'])
  })

  it('compares legacy 4K and 2K labels as tiers without inventing media validation', () => {
    const legacy = (providerId: string, quality: string): ProviderResult => ({
      providerId, providerName: providerId, streams: [{ url: `https://x/${providerId}`, quality }],
    })
    expect(rankProviderResults([legacy('hd', '1080p'), legacy('qhd', '2K'), legacy('uhd', '4K')]).map((item) => item.providerId))
      .toEqual(['uhd', 'qhd', 'hd'])
    expect(rankProviderResults([legacy('legacy', '4K'), result('validated', classifySourceQuality({ url: 'https://x/a', resolution: 720, mediaValidated: true }))])[0].providerId)
      .toBe('validated')
  })

  it('does not auto-fallback to a CAM that arrived before an available standard source', () => {
    const camFirst = result('cam-first', classifySourceQuality({
      url: 'https://cdn.example/hdcam/master.m3u8', resolution: 1080, mediaValidated: true,
    }))
    const standardLater = result('standard-later', classifySourceQuality({
      url: 'https://cdn.example/web-dl/master.m3u8', resolution: 720, mediaValidated: true,
    }))

    expect(selectAutomaticFallback([camFirst, standardLater], null, new Set())?.providerId)
      .toBe('standard-later')
    expect(selectAutomaticFallback([camFirst, standardLater], null, new Set(['standard-later']))?.providerId)
      .toBe('cam-first')
  })
})
