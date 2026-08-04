import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Two defects found while validating the 1.5.1 packaged build against the documentation:
//
//  1. extraction.log was appended to without any size bound and had reached 57 MB on a real
//     installation, although the Phase 9 notes claimed the unbounded log had been replaced.
//  2. auth-tokens.json — a plaintext TMDB key plus dead account-era JWTs — survived forever on any
//     installation whose keychain entry already existed, because the migration only ran on a
//     keychain miss.
//
// These assertions keep both regressions from returning.

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('extraction log is bounded', () => {
  const extractor = read('src/main/stream-extractor/index.ts')

  it('rotates the extraction log instead of appending without limit', () => {
    expect(extractor).toContain('rotateLogIfNeeded')
    expect(extractor).toContain('MAX_EXTRACTION_LOG_BYTES')
    // The rotation call must happen before the append, or the bound never applies.
    expect(extractor.indexOf('rotateLogIfNeeded(logPath')).toBeLessThan(extractor.indexOf('fsPromises.appendFile(logPath'))
  })

  it('caps the extraction log at a bounded size', () => {
    const declared = extractor.match(/MAX_EXTRACTION_LOG_BYTES\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/)
    expect(declared).not.toBeNull()
    const bytes = Number(declared![1]) * Number(declared![2]) * Number(declared![3])
    expect(bytes).toBeGreaterThan(0)
    expect(bytes).toBeLessThanOrEqual(8 * 1024 * 1024)
  })

  it('shares one rotation helper with the redacted diagnostics log', () => {
    expect(read('src/main/diagnostics.ts')).toContain('export function rotateLogIfNeeded')
  })

  it('reclaims logs left oversized by the unbounded era on upgraded installations', () => {
    expect(read('src/main/diagnostics.ts')).toContain('export function reclaimOversizedLog')
    expect(extractor).toContain('reclaimOversizedLog(logPath, MAX_EXTRACTION_LOG_BYTES)')
  })
})

describe('legacy plaintext credential file', () => {
  const auth = read('src/main/ipc/auth.ts')

  it('is purged unconditionally at startup, not only on a keychain miss', () => {
    expect(auth).toContain('export async function purgeLegacyCredentialFile')
    expect(read('src/main/index.ts')).toContain('purgeLegacyCredentialFile()')
  })

  it('only deletes the file after rescuing credentials the keychain lacks', () => {
    const purge = auth.slice(auth.indexOf('export async function purgeLegacyCredentialFile'))
    expect(purge.indexOf('keytar.setPassword')).toBeLessThan(purge.indexOf('unlinkSync'))
    expect(purge).toContain('keytar.getPassword')
  })

  it('never writes account-era tokens back into the keychain', () => {
    const purge = auth.slice(auth.indexOf('export async function purgeLegacyCredentialFile'))
    expect(purge).toContain("key.startsWith('tmdb-key-')")
  })
})

describe('account-era keychain entries', () => {
  const auth = read('src/main/ipc/auth.ts')

  it('deletes the dead access and refresh tokens at startup', () => {
    expect(auth).toContain('export async function purgeAccountEraKeychainEntries')
    expect(auth).toContain("DEAD_ACCOUNT_KEYS = ['access-token', 'refresh-token']")
    expect(read('src/main/index.ts')).toContain('purgeAccountEraKeychainEntries()')
  })

  it('never removes TMDB credentials', () => {
    const start = auth.indexOf('export async function purgeAccountEraKeychainEntries')
    // Bound the slice to this function only; the file continues into the keychain IPC handlers,
    // which legitimately reference tmdb-key.
    const end = auth.indexOf('\nexport ', start + 1)
    const purge = auth.slice(start, end === -1 ? undefined : end)
    expect(purge).toContain('DEAD_ACCOUNT_KEYS')
    expect(purge).not.toContain('tmdb-key')
  })
})
