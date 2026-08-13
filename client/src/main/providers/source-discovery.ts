import type { ProviderResult, StreamQuality } from './interface.js'
import { rankProviderResults } from './source-quality.js'

export type SourceDiscoveryMode = 'progressive' | 'complete'
export type ProviderSourceState = 'searching' | 'available' | 'unavailable' | 'timed-out'

export interface ProviderSourceStatus {
  providerId: string
  providerName: string
  state: ProviderSourceState
  qualityInfo?: StreamQuality
  error?: string
}

export function normalizeSourceDiscoveryMode(value: unknown): SourceDiscoveryMode {
  return value === 'complete' ? 'complete' : 'progressive'
}

export function createInitialSourceStatuses(
  providers: Array<{ id: string; name: string }>,
): ProviderSourceStatus[] {
  return providers.map((provider) => ({
    providerId: provider.id,
    providerName: provider.name,
    state: 'searching',
  }))
}

export function rankSourceStatuses(statuses: ProviderSourceStatus[]): ProviderSourceStatus[] {
  const byId = new Map(statuses.map((status) => [status.providerId, status]))
  const availableResults: ProviderResult[] = statuses
    .filter((status) => status.state === 'available')
    .map((status) => ({
      providerId: status.providerId,
      providerName: status.providerName,
      streams: [{
        url: '',
        quality: status.qualityInfo?.resolutionLabel ?? 'Unknown',
        qualityInfo: status.qualityInfo,
      }],
    }))
  const available = rankProviderResults(availableResults)
    .map((result) => byId.get(result.providerId)!)
  const stateRank: Record<Exclude<ProviderSourceState, 'available'>, number> = {
    searching: 0,
    unavailable: 1,
    'timed-out': 2,
  }
  const remaining = statuses
    .filter((status) => status.state !== 'available')
    .map((status, index) => ({ status, index }))
    .sort((a, b) =>
      stateRank[a.status.state as Exclude<ProviderSourceState, 'available'>]
      - stateRank[b.status.state as Exclude<ProviderSourceState, 'available'>]
      || a.index - b.index)
    .map(({ status }) => status)
  return [...available, ...remaining]
}

export function updateSourceStatus(
  statuses: ProviderSourceStatus[],
  next: ProviderSourceStatus,
): ProviderSourceStatus[] {
  return rankSourceStatuses(statuses.map((status) => status.providerId === next.providerId ? next : status))
}

export function shouldResolveAutomaticSource(
  mode: SourceDiscoveryMode,
  quality: StreamQuality,
  statuses: ProviderSourceStatus[],
): boolean {
  if (mode === 'complete') return false
  const searching = statuses.some((status) => status.state === 'searching')
  if ((quality.releaseType === 'cam' || quality.releaseType === 'telesync') && searching) return false
  return true
}
