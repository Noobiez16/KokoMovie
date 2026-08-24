import type { IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

let trustedRendererWebContentsId: number | null = null
let trustedRendererEntryUrl: string | null = null

export class PublicIpcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicIpcError'
  }
}

export function setTrustedRendererWebContentsId(id: number | null, entryUrl: string | null = null): void {
  trustedRendererWebContentsId = id
  trustedRendererEntryUrl = id === null ? null : entryUrl
}

export function isTrustedRendererUrl(raw: string): boolean {
  if (!trustedRendererEntryUrl) return false
  try {
    const actual = new URL(raw)
    const expected = new URL(trustedRendererEntryUrl)
    actual.hash = ''
    expected.hash = ''
    return actual.href === expected.href
  } catch {
    return false
  }
}

export function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  if (
    trustedRendererWebContentsId === null ||
    event.sender.id !== trustedRendererWebContentsId ||
    !event.senderFrame ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Untrusted IPC sender')
  }

  const raw = event.senderFrame?.url ?? event.sender.getURL()
  if (!isTrustedRendererUrl(raw)) throw new Error('Untrusted IPC sender')
}

export function trustedIpcHandler<Args extends unknown[], Result>(
  handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
): (event: IpcMainInvokeEvent, ...args: Args) => Result {
  return (event, ...args) => {
    try {
      assertTrustedRenderer(event)
      const result = handler(event, ...args)
      if (result instanceof Promise) {
        return result.catch((error: unknown) => normalizeIpcError(error)) as Result
      }
      return result
    } catch (error) {
      return normalizeIpcError(error)
    }
  }
}

function normalizeIpcError(error: unknown): never {
  if (error instanceof Error && error.message === 'Untrusted IPC sender') throw error
  if (error instanceof PublicIpcError) throw error
  if (error instanceof z.ZodError) throw new Error('Invalid IPC request')
  throw new Error('IPC request failed')
}

const proxyHeadersSchema = z.record(z.string().max(8192)).default({}).transform((headers, ctx) => {
  const allowed = new Set(['accept', 'authorization', 'x-github-api-version'])
  const clean: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (!allowed.has(name.toLowerCase())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Header not allowed: ${name}` })
      continue
    }
    clean[name] = value
  }
  return clean
})

export const apiProxyRequestSchema = z.object({
  url: z.string().url().max(4096),
  method: z.literal('GET'),
  headers: proxyHeadersSchema,
}).strict()

export type ApiProxyRequest = z.infer<typeof apiProxyRequestSchema>

const ALLOWED_API_HOSTS = new Set(['api.github.com'])

export function validateApiProxyUrl(raw: string): URL {
  const url = new URL(raw)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !ALLOWED_API_HOSTS.has(url.hostname)
  ) {
    throw new Error('API destination is not allowed')
  }
  return url
}

export const localAccountSchema = z.literal('local')
export const tmdbCredentialSchema = z.string().trim().min(8).max(4096)

export const contentIdSchema = z.string().trim().min(1).max(200)
export const episodeIdSchema = z.string().trim().max(200).nullable().optional()
export const contentTypeSchema = z.enum(['movie', 'tv', 'series'])

export const playbackPositionSchema = z.object({
  contentId: contentIdSchema,
  episodeId: episodeIdSchema,
  contentType: contentTypeSchema.optional(),
  positionSeconds: z.number().finite().nonnegative().max(30 * 24 * 60 * 60),
  durationSeconds: z.number().finite().nonnegative().max(30 * 24 * 60 * 60),
  completed: z.boolean().optional(),
}).strict()

export const preferencesPatchSchema = z.object({
  language: z.enum(['en', 'es', 'fr']).optional(),
  subtitleDefault: z.string().trim().min(1).max(10).nullable().optional(),
  autoplay: z.boolean().optional(),
  maturityRating: z.enum(['G', 'PG', 'PG-13', 'R', 'TV-MA']).optional(),
  sourceDiscoveryMode: z.enum(['progressive', 'complete']).optional(),
}).strict()

export const booleanFlagSchema = z.boolean()
export const appLocaleSchema = z.enum(['en-US', 'es-ES', 'fr-FR'])
export const discordActivitySchema = z.object({
  title: z.string().trim().min(1).max(128),
  episode: z.string().trim().min(1).max(128).optional(),
  startedAt: z.number().finite().int().nonnegative().max(100_000_000_000_000).optional(),
}).strict().nullable()
