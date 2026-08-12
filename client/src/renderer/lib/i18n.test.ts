import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, normalizeLocale, tmdbLocale } from '../../main/locales'
import i18n, { resources, translationKeys } from '../i18n'

describe('application locales', () => {
  it('supports only English, Spanish, and French', () => {
    expect(SUPPORTED_LOCALES.map(({ code }) => code)).toEqual(['en-US', 'es-ES', 'fr-FR'])
  })

  it.each([
    ['en', 'en-US'],
    ['en-GB', 'en-US'],
    ['es', 'es-ES'],
    ['es-MX', 'es-ES'],
    ['fr', 'fr-FR'],
    ['fr-CA', 'fr-FR'],
    ['pt-BR', 'en-US'],
    ['', 'en-US'],
    [undefined, 'en-US'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected)
  })

  it('uses the normalized app locale for TMDB metadata', () => {
    expect(tmdbLocale('es-ES')).toBe('es-ES')
    expect(tmdbLocale('fr-FR')).toBe('fr-FR')
    expect(tmdbLocale('invalid')).toBe('en-US')
  })
})

describe('bundled translation resources', () => {
  it('keeps Spanish and French exactly aligned with canonical English keys', () => {
    const english = translationKeys(resources['en-US'].translation)
    expect(translationKeys(resources['es-ES'].translation)).toEqual(english)
    expect(translationKeys(resources['fr-FR'].translation)).toEqual(english)
  })

  it('interpolates and pluralizes representative messages', async () => {
    await i18n.changeLanguage('es-ES')
    expect(i18n.t('common.greeting', { name: 'Luna' })).toBe('Hola, Luna')
    expect(i18n.t('downloads.itemCount', { count: 1 })).toBe('1 descarga')
    expect(i18n.t('downloads.itemCount', { count: 3 })).toBe('3 descargas')
  })

  it('falls back to English for an unavailable active locale', async () => {
    await i18n.changeLanguage('de-DE')
    expect(i18n.t('nav.settings')).toBe('Settings')
  })
})
