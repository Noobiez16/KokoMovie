import { describe, expect, it, vi } from 'vitest'
import { applyLocale, hydrateLocale, type LocaleDependencies } from '../i18n/locale-controller'

function dependencies(initial = 'en-US'): LocaleDependencies & { calls: string[] } {
  const calls: string[] = []
  let language = initial
  return {
    calls,
    currentLocale: () => language,
    changeLanguage: vi.fn(async (locale) => { calls.push(`language:${locale}`); language = locale }),
    setDocumentLanguage: vi.fn((locale) => { calls.push(`document:${locale}`) }),
    persistLocale: vi.fn(async (locale) => { calls.push(`persist:${locale}`) }),
    setApplicationLocale: vi.fn(async (locale) => { calls.push(`menu:${locale}`) }),
    invalidateLocalizedQueries: vi.fn(async () => { calls.push('invalidate') }),
  }
}

describe('locale controller', () => {
  it('switches immediately, persists, updates the native menu, then refreshes localized data', async () => {
    const deps = dependencies()

    await expect(applyLocale('es-ES', deps)).resolves.toBe('es-ES')

    expect(deps.calls).toEqual([
      'language:es-ES',
      'document:es-ES',
      'persist:es-ES',
      'menu:es-ES',
      'invalidate',
    ])
  })

  it('restores the previous interface and menu when persistence fails', async () => {
    const deps = dependencies('fr-FR')
    vi.mocked(deps.persistLocale).mockImplementationOnce(async () => {
      deps.calls.push('persist:es-ES')
      throw new Error('disk full')
    })

    await expect(applyLocale('es-ES', deps)).rejects.toThrow('disk full')

    expect(deps.calls).toEqual([
      'language:es-ES',
      'document:es-ES',
      'persist:es-ES',
      'language:fr-FR',
      'document:fr-FR',
      'menu:fr-FR',
    ])
    expect(deps.invalidateLocalizedQueries).not.toHaveBeenCalled()
  })

  it('hydrates a saved locale without writing the preference back', async () => {
    const deps = dependencies()

    await expect(hydrateLocale('fr-CA', deps)).resolves.toBe('fr-FR')

    expect(deps.calls).toEqual(['language:fr-FR', 'document:fr-FR', 'menu:fr-FR'])
    expect(deps.persistLocale).not.toHaveBeenCalled()
    expect(deps.invalidateLocalizedQueries).not.toHaveBeenCalled()
  })
})
