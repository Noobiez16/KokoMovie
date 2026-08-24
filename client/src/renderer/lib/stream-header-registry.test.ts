import { describe, expect, it } from 'vitest'
import { StreamHeaderRegistry } from '../../main/providers/stream-header-registry'
import { FIXTURE_BEARER_VALUE, FIXTURE_HEADER_VALUE } from './security-test-fixtures'

describe('stream header registry', () => {
  it('never falls back to headers registered for another origin', () => {
    const registry = new StreamHeaderRegistry()
    registry.registerTrusted('https://a.example/master.m3u8', {
      Referer: 'https://a.example/',
    })

    expect(registry.get('https://a.example/segment.ts')).toEqual({
      Referer: 'https://a.example/',
    })
    expect(registry.get('http://a.example/segment.ts')).toEqual({})
    expect(registry.get('https://b.example/segment.ts')).toEqual({})
  })

  it('drops credential and transport headers from untrusted registrations', () => {
    const registry = new StreamHeaderRegistry()
    registry.registerUntrusted('https://a.example/master.m3u8', {
      Referer: 'https://embed.example/',
      Origin: 'https://embed.example',
      Authorization: FIXTURE_HEADER_VALUE,
      Cookie: FIXTURE_HEADER_VALUE,
      Host: 'a.example',
      Connection: 'keep-alive',
      'Sec-Fetch-Site': 'cross-site',
      'X-Api-Key': FIXTURE_HEADER_VALUE,
      'User-Agent': 'KokoMovie',
    })

    expect(registry.get('https://a.example/segment.ts')).toEqual({
      Referer: 'https://embed.example/',
      Origin: 'https://embed.example',
      'User-Agent': 'KokoMovie',
    })
  })

  it('preserves an extractor-observed authorization header only on its exact origin', () => {
    const registry = new StreamHeaderRegistry()
    registry.registerTrusted('https://TOKEN.example:443/master.m3u8', {
      Authorization: FIXTURE_BEARER_VALUE,
    })

    expect(registry.get('https://token.example/segment.ts')).toEqual({
      Authorization: FIXTURE_BEARER_VALUE,
    })
    expect(registry.get('https://sub.token.example/segment.ts')).toEqual({})
  })
})
