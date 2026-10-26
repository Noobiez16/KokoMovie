import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StreamQuality } from '../../../main/providers/interface'
import { classifySourceQuality } from '../../../main/providers/source-quality'

export function SourceQualityNotice({ quality, mediaUrl, movie }: { quality?: StreamQuality; mediaUrl: string; movie: boolean }) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const release = quality ?? classifySourceQuality({ url: mediaUrl, resolution: 0 })
  const camera = release.releaseType === 'cam' || release.releaseType === 'telesync'
  const identity = `${mediaUrl}:${release.releaseType}`
  if (/^(?:offline:|blob:)/i.test(mediaUrl) || dismissed === identity || (!camera && (!movie || release.releaseType !== 'unknown'))) return null
  return <div className="absolute top-24 left-4 right-4 mx-auto max-w-xl z-30 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-black/85 px-4 py-3 text-sm text-amber-100 backdrop-blur-md">
    <span aria-hidden="true">⚠</span>
    <p role={camera ? 'alert' : 'status'} className="flex-1">{t(camera ? 'player.camNotice' : 'player.unverifiedNotice')}</p>
    <button type="button" aria-label={t('common.close')} onClick={() => setDismissed(identity)} className="rounded px-1 text-amber-100/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-km-accent">×</button>
  </div>
}
