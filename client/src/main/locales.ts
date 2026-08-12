export const SUPPORTED_LOCALES = [
  { code: 'en-US', nativeLabel: 'English' },
  { code: 'es-ES', nativeLabel: 'Español' },
  { code: 'fr-FR', nativeLabel: 'Français' },
] as const

export type AppLocale = typeof SUPPORTED_LOCALES[number]['code']

export const DEFAULT_LOCALE: AppLocale = 'en-US'

export function normalizeLocale(value: unknown): AppLocale {
  if (typeof value !== 'string') return DEFAULT_LOCALE
  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0]
  if (language === 'es') return 'es-ES'
  if (language === 'fr') return 'fr-FR'
  if (language === 'en') return 'en-US'
  return DEFAULT_LOCALE
}

export function tmdbLocale(value: unknown): AppLocale {
  return normalizeLocale(value)
}
