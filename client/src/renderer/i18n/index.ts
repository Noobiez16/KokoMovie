import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../main/locales'
import enUS from './resources/en-US'
import esES from './resources/es-ES'
import frFR from './resources/fr-FR'

export const resources = {
  'en-US': { translation: enUS },
  'es-ES': { translation: esES },
  'fr-FR': { translation: frFR },
} as const

export function translationKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return prefix ? [prefix] : []
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => translationKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort()
}

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES.map(({ code }) => code),
  load: 'currentOnly',
  returnNull: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

export default i18n
