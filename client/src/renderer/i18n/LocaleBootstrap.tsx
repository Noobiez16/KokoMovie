import { useEffect, useState, type ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import i18n from './index'
import { hydrateLocale, type LocaleDependencies } from './locale-controller'

const LOCALIZED_QUERY_ROOTS = new Set([
  'catalog', 'content', 'search', 'recommendations', 'watchlist', 'history', 'home', 'movies', 'series',
])

export function createBrowserLocaleDependencies(queryClient: QueryClient): LocaleDependencies {
  const api = window.electronAPI
  return {
    currentLocale: () => i18n.language,
    changeLanguage: (locale) => i18n.changeLanguage(locale),
    setDocumentLanguage: (locale) => { document.documentElement.lang = locale },
    persistLocale: (locale) => api ? api.prefsSet({ language: locale }) : Promise.resolve(),
    setApplicationLocale: async (locale) => {
      await api?.setApplicationLocale(locale)
    },
    invalidateLocalizedQueries: () => queryClient.invalidateQueries({
      predicate: ({ queryKey }) => LOCALIZED_QUERY_ROOTS.has(String(queryKey[0] ?? '')),
    }),
  }
}

export function LocaleBootstrap({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    const api = window.electronAPI
    const savedLocale = api ? api.prefsGet().then(({ language }) => language) : Promise.resolve('en-US')
    savedLocale
      .then((language) => hydrateLocale(language, createBrowserLocaleDependencies(queryClient)))
      .catch(() => hydrateLocale('en-US', createBrowserLocaleDependencies(queryClient)))
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [queryClient])

  if (!ready) return <div className="min-h-screen bg-km-bg" aria-busy="true" />
  return children
}
