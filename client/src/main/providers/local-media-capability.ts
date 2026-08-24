import { randomBytes, timingSafeEqual } from 'node:crypto'

export const LOCAL_MEDIA_CAPABILITY_HEADER = 'x-kokomovie-media-capability'
const LOCAL_MEDIA_CAPABILITY_PARAM = 'kmc'
const localMediaCapability = randomBytes(32).toString('base64url')

export interface LocalMediaRequestIdentity {
  url?: string
  headers: Record<string, string | string[] | undefined>
}

export function getLocalMediaCapability(): string {
  return localMediaCapability
}

export function isPermittedLocalMediaMethod(method: string | undefined): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function matchesCapability(candidate: string | undefined): boolean {
  if (!candidate) return false
  const expected = Buffer.from(localMediaCapability)
  const actual = Buffer.from(candidate)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function isAuthorizedLocalMediaRequest(
  request: LocalMediaRequestIdentity,
): boolean {
  let queryCapability: string | undefined
  try {
    queryCapability = new URL(request.url ?? '/', 'http://localhost')
      .searchParams.get(LOCAL_MEDIA_CAPABILITY_PARAM) ?? undefined
  } catch {
    queryCapability = undefined
  }

  const headerValue = request.headers[LOCAL_MEDIA_CAPABILITY_HEADER]
  const headerCapability = Array.isArray(headerValue) ? headerValue[0] : headerValue
  return matchesCapability(queryCapability) || matchesCapability(headerCapability)
}

export function withLocalMediaCapability(rawUrl: string): string {
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(rawUrl)
  if (absolute) {
    const parsed = new URL(rawUrl)
    parsed.searchParams.set(LOCAL_MEDIA_CAPABILITY_PARAM, localMediaCapability)
    return parsed.toString()
  }

  const hashIndex = rawUrl.indexOf('#')
  const beforeHash = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl
  const hash = hashIndex >= 0 ? rawUrl.slice(hashIndex) : ''
  const queryIndex = beforeHash.indexOf('?')
  const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : ''
  const params = new URLSearchParams(query)
  params.set(LOCAL_MEDIA_CAPABILITY_PARAM, localMediaCapability)
  return `${path}?${params.toString()}${hash}`
}

export function unwrapLocalMediaProxyUrl(rawUrl: string, expectedPort: number): string {
  try {
    const parsed = new URL(rawUrl)
    const hostname = parsed.hostname.toLowerCase()
    if (
      parsed.protocol !== 'http:'
      || !['localhost', '127.0.0.1', '[::1]'].includes(hostname)
      || Number(parsed.port) !== expectedPort
      || !parsed.pathname.startsWith('/proxy/')
    ) return rawUrl
    parsed.searchParams.delete(LOCAL_MEDIA_CAPABILITY_PARAM)
    const pathAndQuery = `${parsed.pathname.slice('/proxy/'.length)}${parsed.search}`
    const separator = pathAndQuery.indexOf('/')
    const protocol = pathAndQuery.slice(0, separator)
    if (!['http', 'https'].includes(protocol) || separator < 0) return rawUrl
    return `${protocol}://${pathAndQuery.slice(separator + 1)}`
  } catch {
    return rawUrl
  }
}

function decorateLocalManifestUri(uri: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(uri)) {
    try {
      const parsed = new URL(uri)
      if (parsed.protocol === 'offline:') return withLocalMediaCapability(uri)
      const host = parsed.hostname.toLowerCase()
      if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return uri
    } catch {
      return uri
    }
  }
  return withLocalMediaCapability(uri)
}

export function decorateHlsManifestWithLocalCapability(manifest: string): string {
  return manifest
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => (
          `URI="${decorateLocalManifestUri(uri)}"`
        ))
      }

      const uri = line.trim()
      if (!uri) return line
      return line.replace(uri, decorateLocalManifestUri(uri))
    })
    .join('\n')
}
