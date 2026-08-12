import type { AppLocale } from '../../main/locales'
import { normalizeLocale } from '../../main/locales'

export interface LocaleDependencies {
  currentLocale(): string
  changeLanguage(locale: AppLocale): Promise<unknown>
  setDocumentLanguage(locale: AppLocale): void
  persistLocale(locale: AppLocale): Promise<unknown>
  setApplicationLocale(locale: AppLocale): Promise<unknown>
  invalidateLocalizedQueries(): Promise<unknown>
}

async function showLocale(locale: AppLocale, dependencies: LocaleDependencies): Promise<void> {
  await dependencies.changeLanguage(locale)
  dependencies.setDocumentLanguage(locale)
}

export async function applyLocale(value: unknown, dependencies: LocaleDependencies): Promise<AppLocale> {
  const previous = normalizeLocale(dependencies.currentLocale())
  const locale = normalizeLocale(value)
  await showLocale(locale, dependencies)

  try {
    await dependencies.persistLocale(locale)
  } catch (error) {
    await showLocale(previous, dependencies)
    await dependencies.setApplicationLocale(previous)
    throw error
  }

  await dependencies.setApplicationLocale(locale)
  await dependencies.invalidateLocalizedQueries()
  return locale
}

export async function hydrateLocale(value: unknown, dependencies: LocaleDependencies): Promise<AppLocale> {
  const locale = normalizeLocale(value)
  await showLocale(locale, dependencies)
  await dependencies.setApplicationLocale(locale)
  return locale
}
