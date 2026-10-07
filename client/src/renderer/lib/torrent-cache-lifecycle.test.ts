import { describe, expect, it, vi } from 'vitest'
const removal = vi.hoisted(() => ({ fail: false }))
vi.mock('fs/promises', async (original) => {
  const fs = await original<typeof import('fs/promises')>()
  return { ...fs, rm: async (...args: Parameters<typeof fs.rm>) => {
    if (removal.fail) throw new Error('disk deletion denied')
    return fs.rm(...args)
  } }
})
import { mkdtempSync, existsSync, mkdirSync, rmdirSync } from 'fs'
import { join } from 'path'
import { TorrentCacheLifecycle } from '../../main/providers/torrent-cache-lifecycle'

describe('owned torrent cache lifecycle', () => {
  it('retains cache until asynchronous store destruction and resources close', async () => {
    const root = mkdtempSync(join(process.env.TEMP!, 'km-cache-test-'))
    const caches = new TorrentCacheLifecycle(root)
    const cache = caches.allocate()
    let callback!: (err?: Error) => void
    let requested = false
    const torrent = { destroyed: false, destroy(opts: any, cb: any) { requested = opts.destroyStore; this.destroyed = true; callback = cb } }
    caches.attach(cache, torrent)
    let close!: () => void
    let cancelled = false
    const release = caches.retain(torrent, () => { cancelled = true })
    const cleanup = caches.dispose(torrent)
    await Promise.resolve()
    expect(requested).toBe(false)
    expect(cancelled).toBe(true)
    expect(existsSync(cache)).toBe(true)
    close = release; close()
    await Promise.resolve()
    await Promise.resolve()
    expect(requested).toBe(true)
    callback()
    expect(existsSync(cache)).toBe(true)
    await cleanup
    expect(existsSync(cache)).toBe(false)
    await caches.shutdown()
    expect(existsSync(root)).toBe(false)
  })
  it('denies deletion of unallocated paths and cleans partial allocations', async () => {
    const root = mkdtempSync(join(process.env.TEMP!, 'km-cache-test-'))
    const caches = new TorrentCacheLifecycle(root)
    const outside = mkdtempSync(join(process.env.TEMP!, 'km-user-test-'))
    await expect(caches.discard(outside)).rejects.toThrow('unowned')
    expect(existsSync(outside)).toBe(true)
    const child = join(root, 'unregistered'); mkdirSync(child)
    await expect(caches.discard(child)).rejects.toThrow('unowned')
    const allocated = caches.allocate(); await caches.discard(allocated)
    expect(existsSync(allocated)).toBe(false)
    rmdirSync(child); await caches.shutdown(); rmdirSync(outside)
  })
})

it('waits for internal WebTorrent store teardown after close has already fired', async () => {
  const root = mkdtempSync(join(process.env.TEMP!, 'km-cache-test-'))
  const caches = new TorrentCacheLifecycle(root)
  const path = caches.allocate()
  let complete!: () => void
  class Store { close(callback: () => void) { complete = callback } }
  const OwnedStore = caches.storeConstructor(path, Store)
  const store = new OwnedStore(1024, { path, files: [] })
  const torrent = { destroyed: true }
  caches.attach(path, torrent)
  store.destroy(() => {})
  const disposal = caches.dispose(torrent)
  await Promise.resolve()
  expect(existsSync(path)).toBe(true)
  await Promise.resolve()
  complete()
  await disposal
  expect(existsSync(path)).toBe(false)
  await caches.shutdown()
})
it('preserves the owned directory on teardown failure and allows cleanup retry', async () => {
  const root = mkdtempSync(join(process.env.TEMP!, 'km-cache-test-'))
  const caches = new TorrentCacheLifecycle(root)
  const path = caches.allocate()
  const torrent = { destroyed: false, destroy(_: any, callback: any) { this.destroyed = true; callback(new Error('store failure')) } }
  caches.attach(path, torrent)
  await expect(caches.dispose(torrent)).rejects.toThrow('store failure')
  expect(existsSync(path)).toBe(true)
  await caches.dispose(torrent)
  expect(existsSync(path)).toBe(false)
  await caches.shutdown()
})

it('keeps deletion failures controlled and retries only the owned cache', async () => {
  const root = mkdtempSync(join(process.env.TEMP!, 'km-cache-test-'))
  const caches = new TorrentCacheLifecycle(root)
  const path = caches.allocate()
  const torrent = { destroyed: false, destroy(_: any, cb: any) { this.destroyed = true; cb() } }
  caches.attach(path, torrent)
  removal.fail = true
  await expect(caches.dispose(torrent)).rejects.toThrow('disk deletion denied')
  expect(existsSync(path)).toBe(true)
  removal.fail = false
  await caches.dispose(torrent)
  expect(existsSync(path)).toBe(false)
  await caches.shutdown()
})

it('closes the installed filesystem chunk store before removing its allocated directory', async () => {
  // @ts-expect-error fs-chunk-store 5.0.1 ships no declarations; this test verifies its real runtime API.
  const { default: Store } = await import('fs-chunk-store')
  const root = mkdtempSync(join(process.env.TEMP!, 'km-cache-test-'))
  const caches = new TorrentCacheLifecycle(root)
  const path = caches.allocate()
  const OwnedStore = caches.storeConstructor(path, Store)
  expect(() => new OwnedStore(4, { path, files: [{ path: '../user.mp4', length: 4 }] })).toThrow('unowned')
  const store = new OwnedStore(4, { path, files: [{ path: 'video.mp4', length: 4 }], length: 4 })
  await new Promise<void>((resolve, reject) => store.put(0, Buffer.from('data'), (err?: Error) => err ? reject(err) : resolve()))
  expect(existsSync(join(path, 'video.mp4'))).toBe(true)
  const torrent = { destroyed: false, destroy(opts: any, callback: any) {
    expect(opts.destroyStore).toBe(true)
    this.destroyed = true
    store.destroy(callback)
  } }
  caches.attach(path, torrent)
  await caches.dispose(torrent)
  expect(existsSync(path)).toBe(false)
  await caches.shutdown()
})

import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { probeTorrentAudio } from '../../main/providers/torrent-cache-lifecycle'

it('preserves probe tracks when input reaches normal end before child close', async () => {
  const input = new PassThrough()
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
  const release = vi.fn()
  const result = probeTorrentAudio({ length: 4, createReadStream: () => input }, () => child as any, () => release, (tag) => tag === 'spa' ? 'es' : tag)
  input.end(Buffer.from('data'))
  await new Promise<void>((done) => input.once('end', done))
  child.stderr.write('Stream #0:2(spa): Audio: aac')
  child.emit('close', 1)
  await expect(result).resolves.toEqual([{ streamIndex: 2, lang: 'es' }])
  expect(release).toHaveBeenCalledOnce()
})
it('waits for the probe child to close after abnormal input closure', async () => {
  const input = new PassThrough()
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
  const release = vi.fn()
  let completed = false
  const result = probeTorrentAudio({ length: 4, createReadStream: () => input }, () => child as any, () => release, (tag) => tag).then((tracks) => { completed = true; return tracks })
  input.destroy()
  await new Promise<void>((done) => input.once('close', done))
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  expect(completed).toBe(false)
  expect(release).not.toHaveBeenCalled()
  child.emit('close', null)
  await expect(result).resolves.toEqual([])
  expect(release).toHaveBeenCalledOnce()
})
it('keeps cache during cancelled audio probing until FFmpeg actually closes', async () => {
  const root = mkdtempSync(join(process.env.TEMP!, 'km-cache-test-'))
  const caches = new TorrentCacheLifecycle(root)
  const path = caches.allocate()
  const torrent = { destroyed: false, destroy(_: any, cb: any) { this.destroyed = true; cb() } }
  caches.attach(path, torrent)
  const input = new PassThrough()
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
  const probe = probeTorrentAudio({ length: 4, createReadStream: () => input }, () => child as any, (cancel) => caches.retain(torrent, cancel), (tag) => tag)
  const disposal = caches.dispose(torrent)
  await Promise.resolve()
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  expect(existsSync(path)).toBe(true)
  expect(torrent.destroyed).toBe(false)
  child.emit('close', null)
  await probe
  await disposal
  expect(existsSync(path)).toBe(false)
  await caches.shutdown()
})
