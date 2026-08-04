import { describe, expect, it } from 'vitest'
import {
  ProviderCircuitBreaker,
  getProviderContract,
  rankProviderCandidates,
  redactProviderDiagnostic,
  validateProviderEmbedUrl,
  validateStreamRequest,
} from '../../main/providers/contracts'
import { getBundledProviders } from '../../main/providers/registry'

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
