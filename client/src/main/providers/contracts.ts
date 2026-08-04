import { z } from 'zod'
import type { Provider, ProviderResult, StreamRequest } from './interface.js'

const positiveInteger = z.number().int().positive()

export const streamRequestSchema = z.object({
  imdbId: z.string().regex(/^tt\d{5,12}$/).optional(),
  tmdbId: positiveInteger.optional(),
  type: z.enum(['movie', 'tv']),
  season: positiveInteger.optional(),
  episode: positiveInteger.optional(),
  title: z.string().trim().max(300).optional(),
  audioLang: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/).optional(),
}).superRefine((request, context) => {
  if (!request.imdbId && !request.tmdbId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'An IMDB or TMDB ID is required' })
  }
  if (request.type === 'tv' && (!request.season || !request.episode)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'TV requests require season and episode' })
  }
})

export interface ProviderContract {
  id: string
  allowedEmbedHosts: readonly string[]
  timeoutMs: number
  maxAttempts: number
}

const BUNDLED_PROVIDER_HOSTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '2embed': ['www.2embed.cc'],
  autoembed: ['autoembed.to'],
  embedsu: ['embed.su'],
  indra: ['indraembed.netlify.app'],
  moviesapi: ['moviesapi.to'],
  multiembed: ['multiembed.mov'],
  smashystream: ['player.smashystream.com'],
  superembed: ['multiembed.mov'],
  vidbinge: ['vidbinge.dev'],
  vidlink: ['vidlink.pro'],
  vidsrc: ['vidsrc.to'],
  'vidsrc-in': ['vsrc.su'],
  'vidsrc-me': ['vidsrcme.su'],
  'vidsrc-pm': ['vidsrc.pm'],
  'vidsrc-pro': ['vidsrc.pro'],
  'vidsrc-rip': ['vidsrc.rip'],
  'vidsrc-su': ['vidsrc.su'],
  vidsrccc: ['vidsrc.cc'],
  vixsrc: ['vixsrc.to'],
})

export function getProviderContract(providerId: string): ProviderContract | null {
  const allowedEmbedHosts = BUNDLED_PROVIDER_HOSTS[providerId]
  if (!allowedEmbedHosts) return null
  return { id: providerId, allowedEmbedHosts, timeoutMs: 12_000, maxAttempts: 1 }
}

export function validateStreamRequest(input: unknown): StreamRequest {
  return streamRequestSchema.parse(input)
}

export function validateProviderEmbedUrl(provider: Provider, request: StreamRequest): string | null {
  const contract = getProviderContract(provider.id)
  if (!contract) throw new Error('Provider contract is missing')
  const rawUrl = provider.getEmbedUrl(request)
  if (!rawUrl) return null
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Provider returned a disallowed embed URL')
  }
  if (!contract.allowedEmbedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error('Provider returned an undeclared embed host')
  }
  return url.toString()
}

export function redactProviderDiagnostic(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value)
  return message
    .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/(?:api[_-]?key|token|authorization|cookie)=?[^\s&]*/gi, '[redacted-value]')
    .slice(0, 240)
}

export interface ProviderCandidate {
  result: ProviderResult
  resolution: number
  registryOrder: number
  elapsedMs: number
}

export function rankProviderCandidates(candidates: ProviderCandidate[]): ProviderCandidate[] {
  return [...candidates].sort((a, b) =>
    b.resolution - a.resolution
    || a.registryOrder - b.registryOrder
    || a.elapsedMs - b.elapsedMs)
}

interface HealthEntry { failures: number; openUntil: number }

export class ProviderCircuitBreaker {
  private readonly entries = new Map<string, HealthEntry>()

  constructor(
    private readonly failureThreshold = 3,
    private readonly cooldownMs = 5 * 60_000,
  ) {}

  canAttempt(providerId: string, now = Date.now()): boolean {
    const entry = this.entries.get(providerId)
    if (!entry) return true
    if (entry.openUntil > now) return false
    if (entry.openUntil > 0) this.entries.delete(providerId)
    return true
  }

  recordSuccess(providerId: string): void { this.entries.delete(providerId) }

  recordFailure(providerId: string, now = Date.now()): void {
    const current = this.entries.get(providerId) ?? { failures: 0, openUntil: 0 }
    const failures = current.failures + 1
    this.entries.set(providerId, {
      failures,
      openUntil: failures >= this.failureThreshold ? now + this.cooldownMs : 0,
    })
  }

  snapshot(providerId: string, now = Date.now()): { failures: number; circuitOpen: boolean } {
    const entry = this.entries.get(providerId)
    return { failures: entry?.failures ?? 0, circuitOpen: Boolean(entry && entry.openUntil > now) }
  }
}
