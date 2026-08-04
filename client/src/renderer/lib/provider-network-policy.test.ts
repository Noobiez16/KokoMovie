import { describe, expect, it } from 'vitest'
import { isForbiddenProxyHostname, validateProxyTargetUrl } from '../../main/providers/network-policy'

describe('provider proxy network policy', () => {
  it.each([
    'localhost', 'api.localhost', 'printer.local', '127.0.0.1', '10.1.2.3',
    '100.64.0.1', '169.254.1.1', '172.16.0.1', '192.168.1.1', '224.0.0.1',
    '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1',
  ])('blocks private target %s', (hostname) => {
    expect(isForbiddenProxyHostname(hostname)).toBe(true)
  })

  it('allows public CDN targets', () => {
    expect(validateProxyTargetUrl('https://cdn.example.test/video/master.m3u8').hostname)
      .toBe('cdn.example.test')
    expect(validateProxyTargetUrl('http://8.8.8.8/video.ts').hostname).toBe('8.8.8.8')
  })

  it.each([
    'file:///etc/passwd',
    'https://user:pass@example.test/video',
    'https://127.0.0.1/video',
    'http://192.168.1.2/video',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => validateProxyTargetUrl(url)).toThrow()
  })
})
