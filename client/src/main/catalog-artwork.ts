import { app, net, protocol } from 'electron'
import { createHash } from 'crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'

const CACHE_VERSION = 'v1'
const MAX_ARTWORK_BYTES = 15 * 1024 * 1024
const ALLOWED_SIZES = new Set(['w185', 'w300', 'w500', 'w1280'])
const IMAGE_PATH = /^\/[A-Za-z0-9/_-]+\.(?:jpg|jpeg|png|webp)$/

function artworkRoot(): string {
  return join(app.getPath('userData'), 'catalog-artwork', CACHE_VERSION)
}

export function catalogArtworkUrl(path: string | null, size: string): string | null {
  if (!path || !ALLOWED_SIZES.has(size) || !IMAGE_PATH.test(path) || path.includes('..')) return null
  return `catalog-cache://image/${size}${path}`
}

function parseArtworkRequest(raw: string): { remoteUrl: string; cachePath: string; contentType: string } | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'catalog-cache:' || url.hostname !== 'image') return null
    const match = /^\/(w185|w300|w500|w1280)(\/[A-Za-z0-9/_-]+\.(jpg|jpeg|png|webp))$/.exec(decodeURIComponent(url.pathname))
    if (!match || match[2]!.includes('..')) return null
    const extension = match[3]!.toLowerCase()
    const digest = createHash('sha256').update(`${match[1]}${match[2]}`).digest('hex')
    return {
      remoteUrl: `https://image.tmdb.org/t/p/${match[1]}${match[2]}`,
      cachePath: join(artworkRoot(), `${digest}.${extension}`),
      contentType: extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg',
    }
  } catch {
    return null
  }
}

async function responseFromFile(path: string, contentType: string): Promise<Response | null> {
  try {
    const body = await readFile(path)
    return new Response(body, { status: 200, headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' } })
  } catch {
    return null
  }
}

export async function getArtworkCacheStats(): Promise<{ entries: number; bytes: number }> {
  try {
    const { readdir } = await import('fs/promises')
    const names = await readdir(artworkRoot())
    let bytes = 0
    for (const name of names) bytes += (await stat(join(artworkRoot(), name))).size
    return { entries: names.length, bytes }
  } catch {
    return { entries: 0, bytes: 0 }
  }
}

export async function clearArtworkCache(): Promise<void> {
  await rm(artworkRoot(), { recursive: true, force: true })
}

export function registerArtworkProtocol(): void {
  protocol.handle('catalog-cache', async (request) => {
    const parsed = parseArtworkRequest(request.url)
    if (!parsed) return new Response('Not found', { status: 404 })

    const cached = await responseFromFile(parsed.cachePath, parsed.contentType)
    if (cached) return cached

    try {
      const response = await net.fetch(parsed.remoteUrl, { signal: AbortSignal.timeout(20_000) })
      if (!response.ok) throw new Error('Artwork request failed')
      const declared = Number(response.headers.get('content-length') ?? 0)
      if (declared > MAX_ARTWORK_BYTES) throw new Error('Artwork response too large')
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > MAX_ARTWORK_BYTES) throw new Error('Artwork response too large')
      await mkdir(artworkRoot(), { recursive: true })
      const temporary = `${parsed.cachePath}.${process.pid}.tmp`
      await writeFile(temporary, bytes)
      await rename(temporary, parsed.cachePath)
      return new Response(bytes, { status: 200, headers: { 'Content-Type': parsed.contentType, 'Cache-Control': 'public, max-age=86400' } })
    } catch {
      return (await responseFromFile(parsed.cachePath, parsed.contentType)) ?? new Response('Artwork unavailable offline', { status: 404 })
    }
  })
}
