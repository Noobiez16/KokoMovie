import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { playbackApi, type ContinueWatchingItem } from '../api/playback'
import { decodeTmdbEpisodeId } from '../lib/tmdb'
import { useSettingsStore } from '../store/settings'
import { AppLayout } from '../components/layout/AppLayout'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'

type ResumeResponse = Awaited<ReturnType<typeof playbackApi.getContinueWatching>>
export function ContinueWatchingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey)
  const client = useQueryClient()
  const key = ['continue-watching', 'local', tmdbApiKey]
  const query = useQuery({ queryKey: key, queryFn: () => playbackApi.getContinueWatching('local'), refetchOnWindowFocus: 'always' })
  const remove = useMutation({
    mutationFn: (item: ContinueWatchingItem) => playbackApi.removeFromContinueWatching(item.contentId, 'local'),
    onMutate: async (item) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<ResumeResponse>(key)
      client.setQueryData<ResumeResponse>(key, (old) => old ? { ...old, data: old.data.filter((entry) => entry.contentId !== item.contentId) } : old)
      return { previous }
    },
    onError: (_error, _item, context) => { if (context?.previous) client.setQueryData(key, context.previous) },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['continue-watching', 'local'] })
      void client.invalidateQueries({ queryKey: ['history', 'local'] })
    },
  })
  const explore = <button className="km-button-secondary" onClick={() => navigate('/browse')}>{t('ui.exploreLibrary')}</button>
  return <AppLayout><div className="km-page">
    <PageHeader title={t('ui.continueWatching')} description={t('ui.continueWatchingDescription')} />
    {query.isLoading && <p role="status" className="py-12 text-white/60">{t('ui.loadingLibrary')}</p>}
    {query.isError && <EmptyState title={t('history.loadError')} action={<button className="km-button-secondary" onClick={() => query.refetch()}>{t('common.retry')}</button>} />}
    {remove.isError && <p role="alert" className="mb-4 text-red-300">{t('ui.removeFailed')}</p>}
    {!query.isLoading && !query.isError && query.data?.data.length === 0 && <EmptyState title={t('ui.continueWatchingEmpty')} description={t('ui.continueWatchingEmptyDescription')} action={explore} />}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {query.data?.data.map((item) => {
        const episode = decodeTmdbEpisodeId(item.episodeId)
        const episodeLabel = episode
          ? `${t('detail.season', { number: episode.season })} · ${t('detail.episode', { number: episode.episode })}`
          : item.type === 'series' ? t('common.series') : null
        const percent = item.durationSeconds > 0 ? Math.min(100, Math.round(item.positionSeconds / item.durationSeconds * 100)) : 0
        return <article key={item.contentEpisodeId} className="overflow-hidden rounded-2xl border border-white/10 bg-km-surface">
          <button type="button" aria-label={item.title} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-km-accent" onClick={() => navigate(`/content/${item.contentId}`, { state: { resumePosition: item.positionSeconds, ...(item.episodeId ? { resumeEpisodeId: item.episodeId } : {}) } })}>
            {item.backdropUrl || item.s3Thumbnail ? <img src={item.backdropUrl || item.s3Thumbnail!} alt="" className="aspect-video w-full object-cover" /> : <div className="aspect-video bg-white/5" />}
            <div className="p-4"><h2 className="font-semibold text-white">{item.title}</h2><p className="mt-1 text-sm text-white/60">{item.releaseYear} {episodeLabel && `· ${episodeLabel}`}</p><div className="my-3 h-1 rounded-full bg-white/10"><div className="h-full rounded-full bg-km-accent" style={{ width: `${percent}%` }} /></div><p className="text-xs text-white/60">{t('history.inProgress', { percent })} · {t('history.continue')}</p></div>
          </button>
          <div className="border-t border-white/10 px-4 py-3"><button className="text-sm text-white/60 hover:text-white disabled:opacity-50" disabled={remove.isPending} onClick={() => remove.mutate(item)}>{t('common.remove')}</button></div>
        </article>
      })}
    </div>
  </div></AppLayout>
}
