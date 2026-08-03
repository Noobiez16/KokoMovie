import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apiProxyRequestSchema, localAccountSchema, tmdbCredentialSchema, validateApiProxyUrl } from '../../main/ipc/security'

describe('main-process security boundaries', () => {
  it('allows only measured HTTPS API destinations', () => {
    expect(validateApiProxyUrl('https://api.themoviedb.org/3/movie/1').hostname).toBe('api.themoviedb.org')
    expect(validateApiProxyUrl('https://api.github.com/repos/a/b/issues').hostname).toBe('api.github.com')
    for (const url of ['http://api.themoviedb.org/3/movie/1', 'https://example.com/', 'https://api.themoviedb.org.evil.example/', 'https://user:secret@api.github.com/', 'https://api.github.com:444/']) {
      expect(() => validateApiProxyUrl(url)).toThrow('API destination is not allowed')
    }
  })

  it('rejects expanded proxy capabilities', () => {
    expect(apiProxyRequestSchema.parse({ url: 'https://api.themoviedb.org/3/movie/1', method: 'GET', headers: { Authorization: 'Bearer redacted', Accept: 'application/json' } }).method).toBe('GET')
    expect(() => apiProxyRequestSchema.parse({ url: 'https://api.themoviedb.org/3/movie/1', method: 'POST', headers: {} })).toThrow()
    expect(() => apiProxyRequestSchema.parse({ url: 'https://api.themoviedb.org/3/movie/1', method: 'GET', headers: { Cookie: 'secret' } })).toThrow()
    expect(() => apiProxyRequestSchema.parse({ url: 'https://api.themoviedb.org/3/movie/1', method: 'GET', headers: {}, body: 'unexpected' })).toThrow()
  })

  it('limits credentials to the local identity and bounded values', () => {
    expect(localAccountSchema.parse('local')).toBe('local')
    expect(() => localAccountSchema.parse('another-account')).toThrow()
    expect(tmdbCredentialSchema.parse('12345678')).toBe('12345678')
    expect(() => tmdbCredentialSchema.parse('short')).toThrow()
  })
})

describe('Electron window hardening', () => {
  const main = readFileSync(resolve(process.cwd(), 'src/main/index.ts'), 'utf8')
  const extractor = readFileSync(resolve(process.cwd(), 'src/main/stream-extractor/index.ts'), 'utf8')

  it('keeps the primary window isolated and sandboxed', () => {
    for (const setting of ['contextIsolation: true', 'nodeIntegration: false', 'sandbox: true', 'webSecurity: true', 'webviewTag: false', 'allowRunningInsecureContent: false']) expect(main).toContain(setting)
  })

  it('isolates extraction and denies permissions, popups, and downloads', () => {
    for (const setting of ['contextIsolation: true', 'nodeIntegration: false', 'sandbox: true', 'setPermissionRequestHandler', "return { action: 'deny' }", "providerSession.on('will-download'"]) expect(extractor).toContain(setting)
  })
})
