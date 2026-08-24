import { describe, expect, it } from 'vitest'
import {
  isForbiddenProxyHostname,
  resolveValidatedRedirect,
  validateProxyTargetUrl,
  validateResolvedAddresses,
} from '../../main/providers/network-policy'
import { urlWithFixtureCredentials } from './security-test-fixtures'

describe('provider proxy network policy', () => {
  it.each([
    'localhost', 'api.localhost', 'printer.local', '127.0.0.1', '10.1.2.3',
    '100.64.0.1', '169.254.1.1', '172.16.0.1', '192.168.1.1', '224.0.0.1',
    '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1',
    '::ffff:7f00:1', 'ff02::1', '2001:db8::1', 'fec0::1',
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
    urlWithFixtureCredentials('example.test', '/video'),
    'https://127.0.0.1/video',
    'http://192.168.1.2/video',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => validateProxyTargetUrl(url)).toThrow()
  })

  it('allows public targets on explicit provider ports', () => {
    expect(validateProxyTargetUrl('https://cdn.example.test:8443/video.m3u8').port).toBe('8443')
  })

  it('resolves only redirects that remain on public HTTP(S) targets', () => {
    expect(resolveValidatedRedirect(
      'https://cdn.example.test/video/master.m3u8',
      '../segments/1.ts',
    ).toString()).toBe('https://cdn.example.test/segments/1.ts')

    for (const location of [
      'https://127.0.0.1/secret',
      'http://169.254.169.254/latest/meta-data',
      urlWithFixtureCredentials('cdn.example.test', '/segment.ts'),
    ]) {
      expect(() => resolveValidatedRedirect('https://cdn.example.test/master.m3u8', location)).toThrow()
    }
  })

  it('rejects an entire DNS answer set when any address is private', () => {
    expect(() => validateResolvedAddresses(['8.8.8.8', '10.0.0.2'])).toThrow()
    expect(() => validateResolvedAddresses(['8.8.8.8', '2001:4860:4860::8888'])).not.toThrow()
    expect(() => validateResolvedAddresses([])).toThrow()
  })
})
