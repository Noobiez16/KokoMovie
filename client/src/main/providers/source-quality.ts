import type {
  ProviderResult,
  StreamQuality,
  StreamQualityConfidence,
  StreamReleaseType,
} from './interface.js'

export interface SourceQualityInput {
  url: string
  resolution: number
  declaredQuality?: string | null
  manifestText?: string | null
  mediaValidated?: boolean
}

const CAM_PATTERN = /(?:^|[^a-z])(?:hd[-_. ]?cam|camrip|cam)(?:[^a-z]|$)/i
const TELESYNC_PATTERN = /(?:^|[^a-z])(?:telesync|hd[-_. ]?ts|tsrip)(?:[^a-z]|$)/i
const STANDARD_PATTERN = /(?:web[-_. ]?dl|web[-_. ]?rip|blu[-_. ]?ray|brrip|remux|hdtv)/i

function resolutionLabel(resolution: number): string {
  if (resolution >= 2160) return '4K'
  if (resolution >= 1440) return '1440p'
  if (resolution >= 1080) return '1080p'
  if (resolution >= 720) return '720p'
  if (resolution > 0) return 'SD'
  return 'Unknown'
}

function detectReleaseType(value: string): StreamReleaseType {
  if (CAM_PATTERN.test(value)) return 'cam'
  if (TELESYNC_PATTERN.test(value)) return 'telesync'
  if (STANDARD_PATTERN.test(value)) return 'standard'
  return 'unknown'
}

function detectUrlQualityParameter(url: string): StreamReleaseType {
  try {
    const quality = new URL(url).searchParams.get('quality')?.trim().toLowerCase()
    if (quality === 'cam' || quality === 'camrip' || quality === 'hdcam') return 'cam'
    if (quality === 'ts' || quality === 'telesync' || quality === 'hdts' || quality === 'tsrip') return 'telesync'
  } catch {
    // Non-URL evidence is handled by the boundary-safe text classifier below.
  }
  return 'unknown'
}

export function classifySourceQuality(input: SourceQualityInput): StreamQuality {
  const declared = input.declaredQuality?.trim() ?? ''
  const declaredType = detectReleaseType(declared)
  const explicitUrlType = detectUrlQualityParameter(input.url)
  const inferredType = explicitUrlType !== 'unknown'
    ? explicitUrlType
    : detectReleaseType(`${input.url}\n${input.manifestText ?? ''}`)
  const releaseType = declaredType !== 'unknown' ? declaredType : inferredType
  const confidence: StreamQualityConfidence = declaredType !== 'unknown'
    ? 'declared'
    : inferredType !== 'unknown'
      ? 'inferred'
      : 'unknown'
  const label = resolutionLabel(input.resolution)
  const displayLabel = releaseType === 'cam'
    ? 'CAM'
    : releaseType === 'telesync'
      ? 'TS'
      : confidence === 'unknown'
        ? `${label} · Unverified`
        : `${label} · ${confidence === 'declared' ? 'Declared' : 'Inferred'}`

  return {
    resolution: Math.max(0, Math.floor(input.resolution || 0)),
    resolutionLabel: label,
    releaseType,
    confidence,
    displayLabel,
    mediaValidated: input.mediaValidated === true,
  }
}

function qualityFor(result: ProviderResult): StreamQuality {
  const stream = result.streams[0]
  if (stream?.qualityInfo) return stream.qualityInfo
  const parsed = Number.parseInt(stream?.quality ?? '', 10)
  return classifySourceQuality({
    url: stream?.url ?? '',
    resolution: Number.isFinite(parsed) ? parsed : 0,
    mediaValidated: false,
  })
}

function releaseRank(type: StreamReleaseType): number {
  if (type === 'standard') return 0
  if (type === 'unknown') return 1
  return 2
}

export function rankProviderResults(results: ProviderResult[]): ProviderResult[] {
  return results
    .map((result, index) => ({ result, index, quality: qualityFor(result) }))
    .sort((a, b) =>
      releaseRank(a.quality.releaseType) - releaseRank(b.quality.releaseType)
      || Number(b.quality.mediaValidated) - Number(a.quality.mediaValidated)
      || b.quality.resolution - a.quality.resolution
      || a.index - b.index)
    .map(({ result }) => result)
}

export function selectAutomaticFallback(
  results: ProviderResult[],
  activeProviderId: string | null,
  triedProviderIds: ReadonlySet<string>,
): ProviderResult | undefined {
  return rankProviderResults(results).find((result) =>
    result.providerId !== activeProviderId
    && !result.providerId.startsWith('p2p-')
    && !triedProviderIds.has(result.providerId)
    && result.streams.length > 0)
}
