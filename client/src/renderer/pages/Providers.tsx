import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { providersApi } from '../api/providers'
import { AppLayout } from '../components/layout/AppLayout'

export function ProvidersPage() {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />

  const qc = useQueryClient()

  const { data: providers, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.list(),
    staleTime: 60 * 1000,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      providersApi.toggle(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-white mb-2">Stream Providers</h1>
        <p className="text-white/50 text-sm mb-8">
          Providers are third-party sources that KokoMovie uses to find video streams.
          Enable or disable them below. When you play content, KokoMovie will try each enabled
          provider in order until a stream is found.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-3 text-white/40">
            <div className="w-5 h-5 border-2 border-white/20 border-t-km-accent rounded-full animate-spin" />
            Loading providers...
          </div>
        ) : (
          <div className="space-y-3">
            {providers?.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-km-card rounded-lg px-5 py-4 border border-white/10"
              >
                <div>
                  <p className="text-white font-medium flex items-center gap-2">
                    {p.name}
                    {['vidbinge', 'embedsu', 'vidsrc'].includes(p.id) && (
                      <span className="text-km-accent text-[10px] font-semibold bg-km-accent/15 px-1.5 py-0.5 rounded border border-km-accent/25 uppercase tracking-wider">
                        Recommended
                      </span>
                    )}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {p.id === 'vidsrc' && 'vidsrc.to — large catalog via IMDB or TMDB ID'}
                    {p.id === 'vidsrc-me' && 'vidsrc.me — movies & TV via TMDB ID'}
                    {p.id === '2embed' && '2embed.cc — wide catalog, IMDB or TMDB ID'}
                    {p.id === 'superembed' && 'multiembed.mov — aggregates multiple sub-sources (TMDB ID)'}
                    {p.id === 'embedsu' && 'embed.su — clean player, TMDB ID'}
                    {p.id === 'autoembed' && 'autoembed.to — IMDB or TMDB ID, good TV coverage'}
                    {p.id === 'smashystream' && 'player.smashystream.com — IMDB or TMDB ID'}
                    {p.id === 'vidbinge' && 'vidbinge.dev — IMDB or TMDB ID'}
                    {p.id === 'moviesapi' && 'moviesapi.club — TMDB ID only'}
                  </p>
                </div>

                <button
                  onClick={() => toggleMutation.mutate({ id: p.id, enabled: !p.enabled })}
                  disabled={toggleMutation.isPending}
                  className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                    p.enabled ? 'bg-km-accent' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      p.enabled ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 p-4 bg-white/5 rounded-lg border border-white/10">
          <p className="text-white/40 text-xs leading-relaxed">
            <span className="text-white/60 font-medium">Note:</span> Stream extraction opens
            a hidden browser window that loads the provider's embed page and intercepts
            the video URL. This is similar to how browser extensions like Stremio work.
            Streams are found within ~10–20 seconds.
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
