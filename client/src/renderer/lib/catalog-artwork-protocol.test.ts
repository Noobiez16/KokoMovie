import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ getPath: vi.fn(), fetch: vi.fn(), handle: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: electron.getPath }, net: { fetch: electron.fetch }, protocol: { handle: electron.handle } }))
import { catalogArtworkUrl, registerArtworkProtocol } from '../../main/catalog-artwork'

let cacheRoot: string
let request: (request: { url: string }) => Promise<Response>
beforeEach(async () => {
  electron.fetch.mockReset(); electron.handle.mockReset()
  cacheRoot = await mkdtemp(join(tmpdir(), 'km-artwork-test-'))
  electron.getPath.mockReturnValue(cacheRoot)
  registerArtworkProtocol()
  request = electron.handle.mock.calls[0]![1]
})
afterEach(async () => { await rm(cacheRoot, { recursive: true, force: true }) })

describe('catalog artwork original protocol', () => {
  it('allows the official original size while retaining the path allowlist', () => {
    expect(catalogArtworkUrl('/backdrop.jpg', 'original')).toBe('catalog-cache://image/original/backdrop.jpg')
    expect(catalogArtworkUrl('/backdrop.jpg', 'w9999')).toBeNull()
    expect(catalogArtworkUrl('/../backdrop.jpg', 'original')).toBeNull()
  })
  it('fetches original from the fixed TMDB host and serves its cached bytes offline', async () => {
    electron.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
    const url = 'catalog-cache://image/original/backdrop.jpg'
    const result = await request({ url })
    expect(result.status).toBe(200)
    expect(electron.fetch).toHaveBeenCalledWith('https://image.tmdb.org/t/p/original/backdrop.jpg', { signal: expect.any(AbortSignal) })
    electron.fetch.mockRejectedValue(new Error('offline'))
    const offline = await request({ url })
    expect(Array.from(new Uint8Array(await offline.arrayBuffer()))).toEqual([1, 2, 3])
    expect(electron.fetch).toHaveBeenCalledTimes(1)
  })
  it.each([
    'catalog-cache://evil/original/backdrop.jpg', 'catalog-cache://image/w9999/backdrop.jpg',
    'catalog-cache://user@image/original/backdrop.jpg', 'catalog-cache://image:123/original/backdrop.jpg',
    'catalog-cache://image/original/backdrop.jpg?url=https://evil.example',
    'catalog-cache://image/original/backdrop.jpg#suffix', 'catalog-cache://image/original/folder/../backdrop.jpg',
    'catalog-cache://image/original/folder/%2e%2e/backdrop.jpg',
    'catalog-cache://image/original/%2f%2fevil.example/backdrop.jpg',
    'catalog-cache://image/original/%2f%2ffolder/backdrop.jpg',
    'catalog-cache://image/original/folder//backdrop.jpg',
    'https://image.tmdb.org/t/p/original/backdrop.jpg',
  ])('rejects invalid original request %s before any network request', async url => {
    expect((await request({ url })).status).toBe(404)
    expect(electron.fetch).not.toHaveBeenCalled()
  })
  it('retains the response size ceiling for original images', async () => {
    electron.fetch.mockResolvedValue(new Response('oversized', { headers: { 'content-length': String(16 * 1024 * 1024) } }))
    expect((await request({ url: 'catalog-cache://image/original/big.jpg' })).status).toBe(404)
  })
  it('retains the measured byte ceiling when content-length is omitted', async () => {
    electron.fetch.mockResolvedValue(new Response(new Uint8Array(15 * 1024 * 1024 + 1)))
    expect((await request({ url: 'catalog-cache://image/original/big.jpg' })).status).toBe(404)
  })
})
