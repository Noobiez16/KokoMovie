import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { recommendationApi } from '../../api/recommendation'
import { useSettingsStore } from '../../store/settings'
import { ContentRow } from './ContentRow'
import type { ContentSummary } from '../../api/catalog'

export function usePersonalSuggestions(enabled: boolean) {
  const { i18n } = useTranslation()
  const key = useSettingsStore(state => state.tmdbApiKey)
  return useQuery({
    queryKey: ['recommendations', 'personalized', key, i18n?.language],
    queryFn: recommendationApi.getPersonalized,
    enabled: enabled && !!key && !!window.electronAPI?.watchlistList && !!window.electronAPI?.positionList,
    staleTime: 0,
    retry: false,
  })
}

export function PersonalSuggestions({ items }: { items: ContentSummary[] }) {
  const { t } = useTranslation()
  if (!items.length) return null
  return <ContentRow title={t('catalog.forYou')} description={t('catalog.forYouDescription')} items={items} />
}
