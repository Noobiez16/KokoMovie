import { describe, expect, it } from 'vitest'
import {
  ProviderCircuitBreaker,
  audioLanguageSchema,
  getProviderContract,
  magnetUriSchema,
  providerIdSchema,
  providerSearchIdSchema,
  providerStreamHeadersSchema,
  providerToggleSchema,
  rankProviderCandidates,
  redactProviderDiagnostic,
  validateProviderEmbedUrl,
  validateStreamRequest,
} from '../../main/providers/contracts'
import { getBundledProviders } from '../../main/providers/registry'
import { FIXTURE_HEADER_VALUE } from './security-test-fixtures'

const MOVIE_FIXTURE = { type: 'movie' as const, imdbId: 'tt0133093', tmdbId: 603 }
const TV_FIXTURE = { type: 'tv' as const, imdbId: 'tt0944947', tmdbId: 1399, season: 1, episode: 1 }

describe('provider contracts', () => {
  it('declares and respects an HTTPS embed host for every bundled provider', () => {
    for (const provider of getBundledProviders()) {
      expect(getProviderContract(provider.id), provider.id).not.toBeNull()
      for (const fixture of [MOVIE_FIXTURE, TV_FIXTURE]) {
        expect(validateProviderEmbedUrl(provider, fixture), provider.id + ' ' + fixture.type)
          .toMatch(/^https:\/\//)
      }
    }
  })

  it('rejects malformed renderer input', () => {
    expect(validateStreamRequest(TV_FIXTURE)).toMatchObject(TV_FIXTURE)
    expect(() => validateStreamRequest({ type: 'tv', tmdbId: 1, season: 1 })).toThrow()
    expect(() => validateStreamRequest({ type: 'movie', imdbId: 'invalid' })).toThrow()
    expect(() => validateStreamRequest({ ...MOVIE_FIXTURE, unexpected: true })).toThrow()
    expect(() => providerIdSchema.parse('x'.repeat(65))).toThrow()
    expect(() => providerSearchIdSchema.parse('x'.repeat(129))).toThrow()
    expect(providerToggleSchema.parse({ providerId: 'vidsrc', enabled: true })).toEqual({ providerId: 'vidsrc', enabled: true })
    expect(() => providerToggleSchema.parse({ providerId: 'vidsrc', enabled: 'yes' })).toThrow()
  })

  it('bounds stream-header, magnet, and language inputs', () => {
    expect(providerStreamHeadersSchema.parse({
      streamUrl: 'https://cdn.example.test/master.m3u8',
      headers: { Referer: 'https://embed.example.test/' },
    })).toMatchObject({ streamUrl: 'https://cdn.example.test/master.m3u8' })
    expect(() => providerStreamHeadersSchema.parse({
      streamUrl: 'https://cdn.example.test/master.m3u8',
      headers: { Authorization: FIXTURE_HEADER_VALUE },
    })).toThrow()
    expect(() => providerStreamHeadersSchema.parse({
      streamUrl: 'file:///etc/passwd',
      headers: {},
    })).toThrow()
    expect(magnetUriSchema.parse('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'))
      .toMatch(/^magnet:/)
    expect(() => magnetUriSchema.parse('https://example.test/file.torrent')).toThrow()
    expect(audioLanguageSchema.parse('es')).toBe('es')
    expect(() => audioLanguageSchema.parse('spanish')).toThrow()
  })

  it('redacts URLs and credential-like diagnostics', () => {
    expect(redactProviderDiagnostic('failed https://example.test/a?token=secret api_key=secret'))
      .not.toContain('secret')
  })

  it('ranks quality first and preserves registry order for equal quality', () => {
    const result = (id: string) => ({ providerId: id, providerName: id, streams: [] })
    const ranked = rankProviderCandidates([
      { result: result('first'), resolution: 720, registryOrder: 0, elapsedMs: 5000 },
      { result: result('second'), resolution: 720, registryOrder: 1, elapsedMs: 1000 },
      { result: result('hd'), resolution: 1080, registryOrder: 2, elapsedMs: 3000 },
    ])
    expect(ranked.map((candidate) => candidate.result.providerId)).toEqual(['hd', 'first', 'second'])
  })

  it('opens after repeated failures and resets after cooldown or success', () => {
    const breaker = new ProviderCircuitBreaker(2, 100)
    breaker.recordFailure('p', 1000)
    expect(breaker.canAttempt('p', 1001)).toBe(true)
    breaker.recordFailure('p', 1002)
    expect(breaker.canAttempt('p', 1050)).toBe(false)
    expect(breaker.canAttempt('p', 1103)).toBe(true)
    breaker.recordFailure('p', 1200)
    breaker.recordSuccess('p')
    expect(breaker.snapshot('p', 1201)).toEqual({ failures: 0, circuitOpen: false })
  })
})
