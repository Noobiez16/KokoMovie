import { describe, expect, it } from 'vitest'
import { validateExtractorRequestTarget } from '../../main/stream-extractor/egress-policy'
import { urlWithFixtureCredentials } from './security-test-fixtures'

describe('provider extraction egress policy', () => {
  it('allows public HTTP(S) provider and CDN targets', () => {
    expect(() => validateExtractorRequestTarget('https://cdn.example.com/video/master.m3u8', ['93.184.216.34'])).not.toThrow()
    expect(() => validateExtractorRequestTarget('http://93.184.216.34:8080/embed', ['93.184.216.34'])).not.toThrow()
    expect(() => validateExtractorRequestTarget('https://public.example/', ['203.1.1.1'])).not.toThrow()
  })

  it.each([
    'http://localhost/admin',
    'http://127.0.0.1:3000/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.0.2.1/',
    'http://198.51.100.1/',
    'http://203.0.113.1/',
    'http://[::1]/',
    'file:///etc/passwd',
    urlWithFixtureCredentials('example.com'),
  ])('rejects a forbidden target: %s', (url) => {
    expect(() => validateExtractorRequestTarget(url, [])).toThrow()
  })

  it('rejects hostnames whose DNS answers include private space', () => {
    expect(() => validateExtractorRequestTarget('https://rebinding.example/', ['93.184.216.34', '10.0.0.5'])).toThrow()
  })
})
