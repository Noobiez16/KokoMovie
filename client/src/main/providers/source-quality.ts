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

const CAM_PATTERN = /(?:^|[^a-z])(?:hd[-_. ]?cam(?:[-_. ]?rip)?|cam[-_. ]?rip|cam)(?:[^a-z]|$)/i
const TELESYNC_PATTERN = /(?:^|[^a-z])(?:tele[-_. ]?sync|hd[-_. ]?ts|ts[-_. ]?rip)(?:[^a-z]|$)/i
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
  // Nested/encoded provider URLs must not hide release markers. Keep work bounded.
  value = value.slice(0, 5 * 1024 * 1024)
  for (let pass = 0; pass < 2; pass++) {
    const decoded = value.replace(/(?:%[0-9a-f]{2})+/gi, encoded => {
      try { return decodeURIComponent(encoded) } catch { return encoded }
    })
    if (decoded === value) break
    value = decoded
  }
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
  // A positive provider claim must never erase a camera-recording marker elsewhere.
  const negativeType = isCam(declaredType) ? declaredType : isCam(inferredType) ? inferredType : null
  const releaseType = negativeType ?? (declaredType !== 'unknown' ? declaredType : inferredType)
  const confidence: StreamQualityConfidence = negativeType && negativeType !== declaredType ? 'inferred' : declaredType !== 'unknown'
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
  const label = stream?.quality ?? ''
  const parsed = /\b4k\b/i.test(label) ? 2160
    : /\b2k\b/i.test(label) ? 1440
      : Number.parseInt(label.match(/\b(\d{3,4})p?\b/i)?.[1] ?? '', 10)
  return classifySourceQuality({
    url: stream?.url ?? '',
    resolution: Number.isFinite(parsed) ? parsed : 0,
    declaredQuality: label,
    mediaValidated: false,
  })
}

function releaseRank(type: StreamReleaseType): number {
  if (type === 'standard') return 0
  if (type === 'unknown') return 1
  return 2
}

function isCam(type: StreamReleaseType): boolean {
  return type === 'cam' || type === 'telesync'
}

export function rankProviderResults(results: ProviderResult[]): ProviderResult[] {
  return results
    .map((result, index) => ({ result, index, quality: qualityFor(result) }))
    .sort((a, b) =>
      Number(isCam(a.quality.releaseType)) - Number(isCam(b.quality.releaseType))
      || Number(b.quality.mediaValidated) - Number(a.quality.mediaValidated)
      || b.quality.resolution - a.quality.resolution
      || releaseRank(a.quality.releaseType) - releaseRank(b.quality.releaseType)
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
