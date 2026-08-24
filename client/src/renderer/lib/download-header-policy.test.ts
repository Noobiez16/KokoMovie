import { describe, expect, it } from 'vitest'
import { headersForDownloadTarget } from '../../main/download-header-policy'
import { FIXTURE_BEARER_VALUE, FIXTURE_COOKIE_VALUE, FIXTURE_HEADER_VALUE } from './security-test-fixtures'

describe('download exact-origin header policy', () => {
  const stored = {
    Authorization: FIXTURE_BEARER_VALUE,
    Cookie: FIXTURE_COOKIE_VALUE,
    Referer: 'https://player.example/watch',
  }

  it('keeps source credentials on the exact source origin', () => {
    expect(headersForDownloadTarget(
      'https://media.example/segment.ts',
      'https://media.example/master.m3u8',
      stored,
      {},
    )).toMatchObject(stored)
  })

  it('reuses no stored headers after an origin change and uses only target registry headers', () => {
    expect(headersForDownloadTarget(
      'https://cdn.example/segment.ts',
      'https://media.example/master.m3u8',
      stored,
      { Authorization: FIXTURE_HEADER_VALUE, Origin: 'https://cdn.example' },
    )).toEqual({ Authorization: FIXTURE_HEADER_VALUE, Origin: 'https://cdn.example' })
  })

  it('treats a scheme or port change as cross-origin', () => {
    const result = headersForDownloadTarget(
      'https://media.example:8443/key',
      'https://media.example/master.m3u8',
      stored,
      {},
    )
    expect(result.Authorization).toBeUndefined()
    expect(result.Cookie).toBeUndefined()
    expect(result.Referer).toBeUndefined()
  })
})
