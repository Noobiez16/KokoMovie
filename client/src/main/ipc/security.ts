import type { IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

const TRUSTED_DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

export function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  const raw = event.senderFrame?.url ?? event.sender.getURL()
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Untrusted IPC sender')
  }

  const trustedFile = url.protocol === 'file:'
  const trustedDev = TRUSTED_DEV_ORIGINS.has(url.origin)
  if (!trustedFile && !trustedDev) throw new Error('Untrusted IPC sender')
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
