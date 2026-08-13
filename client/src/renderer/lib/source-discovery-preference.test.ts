import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('source discovery preference wiring', () => {
  it('persists progressive as the default and migrates existing databases', () => {
    const sqlite = source('../../main/db/sqlite.ts')
    expect(sqlite).toContain("source_discovery_mode TEXT NOT NULL DEFAULT 'progressive'")
    expect(sqlite).toContain('ALTER TABLE preferences ADD COLUMN source_discovery_mode')
  })

  it('passes the preference across IPC and the renderer API', () => {
    for (const path of ['../../main/ipc/library.ts', '../../main/preload.ts', '../vite-env.d.ts', '../api/user.ts']) {
      expect(source(path)).toContain('sourceDiscoveryMode')
    }
  })

  it('offers both modes and identifies the recommended choice', () => {
    const settings = source('../pages/Settings.tsx')
    expect(settings).toContain('settings.sourceDiscoveryProgressive')
    expect(settings).toContain('settings.sourceDiscoveryComplete')
    expect(settings).toContain('settings.recommended')
  })

  it.each(['en-US.ts', 'es-ES.ts', 'fr-FR.ts'])('%s translates the source discovery setting', (file) => {
    const translations = source(`../i18n/resources/${file}`)
    expect(translations).toContain('sourceDiscoveryProgressive:')
    expect(translations).toContain('sourceDiscoveryComplete:')
  })
})
