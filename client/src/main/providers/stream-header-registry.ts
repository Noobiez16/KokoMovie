const STREAM_HEADER_TTL_MS = 4 * 60 * 60 * 1_000

const BLOCKED_HEADERS = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const CREDENTIAL_LIKE_HEADER = /(?:auth|credential|key|secret|signature|token)/i

interface RegistryEntry {
  headers: Record<string, string>
  expiry: ReturnType<typeof setTimeout>
}

function normalizeOrigin(value: string): string | null {
  const candidate = value.trim()
  if (!candidate) return null

  try {
    const parsed = new URL(candidate)
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username ||
      parsed.password
    ) {
      return null
    }
    return parsed.origin.toLowerCase()
  } catch {
    return null
  }
}

function filterHeaders(
  headers: Record<string, string>,
  trustedExtractor: boolean,
): Record<string, string> {
  const filtered: Record<string, string> = {}

  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase()
    if (BLOCKED_HEADERS.has(lowerName) || lowerName.startsWith('sec-')) continue
    if (!trustedExtractor && CREDENTIAL_LIKE_HEADER.test(lowerName)) continue
    filtered[name] = String(value)
  }

  return filtered
}

export function sanitizeUntrustedStreamHeaders(
  headers: unknown,
): Record<string, string> {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {}
  return filterHeaders(headers as Record<string, string>, false)
}

export class StreamHeaderRegistry {
  private readonly entries = new Map<string, RegistryEntry>()

  registerTrusted(streamUrl: string, headers: Record<string, string>): void {
    this.register(streamUrl, headers, true)
  }

  registerUntrusted(streamUrl: string, headers: Record<string, string>): void {
    this.register(streamUrl, headers, false)
  }

  get(urlOrHost: string): Record<string, string> {
    const origin = normalizeOrigin(urlOrHost)
    if (!origin) return {}
    return { ...(this.entries.get(origin)?.headers ?? {}) }
  }

  has(urlOrHost: string): boolean {
    const origin = normalizeOrigin(urlOrHost)
    return origin !== null && this.entries.has(origin)
  }

  clear(urlOrHost: string): void {
    const origin = normalizeOrigin(urlOrHost)
    if (!origin) return
    const existing = this.entries.get(origin)
    if (existing) clearTimeout(existing.expiry)
    this.entries.delete(origin)
  }

  private register(
    streamUrl: string,
    headers: Record<string, string>,
    trustedExtractor: boolean,
  ): void {
    const origin = normalizeOrigin(streamUrl)
    if (!origin) return

    const existing = this.entries.get(origin)
    if (existing) clearTimeout(existing.expiry)

    const expiry = setTimeout(() => {
      this.entries.delete(origin)
    }, STREAM_HEADER_TTL_MS)
    expiry.unref?.()

    this.entries.set(origin, {
      headers: filterHeaders(headers, trustedExtractor),
      expiry,
    })
  }
}
