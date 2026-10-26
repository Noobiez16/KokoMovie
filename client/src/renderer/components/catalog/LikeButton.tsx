import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

export function LikeButton({ contentId, contentType }: { contentId: string; contentType: string }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const bridge = window.electronAPI
  const likes = useQuery({ queryKey: ['likes', 'local'], queryFn: () => bridge!.likesList(), enabled: !!bridge?.likesList, staleTime: 30_000 })
  const liked = likes.data?.some(row => row.content_id === contentId) ?? false
  const update = useMutation({
    mutationFn: () => bridge!.likeSet({ contentId, contentType, liked: !liked }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['likes'] }),
        client.invalidateQueries({ queryKey: ['recommendations', 'personalized'] }),
      ])
    },
  })
  return <div>
    <button type="button" aria-pressed={liked} disabled={!likes.isSuccess || update.isPending} onClick={() => update.mutate()}
      className={`flex items-center gap-2 font-semibold px-5 py-3 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-accent disabled:opacity-50 ${liked ? 'bg-km-accent/20 border-km-accent text-white' : 'border-white/40 text-white hover:bg-white/10'}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"><path d="M7 10v11H3V10h4Zm0 0 5-8c3 0 3 3 1 7h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7" /></svg>
      {t(liked ? 'detail.liked' : 'detail.like')}
    </button>
    {(update.isError || likes.isError) && <p role="alert" className="mt-2 text-xs text-amber-300">{t('common.failedToSave')}</p>}
  </div>
}
