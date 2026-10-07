import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { TorrentCacheLifecycle } from '../../main/providers/torrent-cache-lifecycle'

function pool() {
  const caches = new TorrentCacheLifecycle(mkdtempSync(join(process.env.TEMP!, 'km-pool-')), 2)
  const torrents: any[] = []
  const acquire = (hash: string) => caches.acquire(
    async () => torrents.find(t => t.hash === hash && !t.destroyed),
    () => { const torrent = { hash, destroyed: false, destroy(_: unknown, cb: () => void) { this.destroyed = true; cb() } }; torrents.push(torrent); caches.attach(caches.allocate(), torrent); return torrent },
  )
  return { caches, torrents, acquire }
}
describe('bounded torrent resolver ownership', () => {
  it('evicts idle B rather than actively streaming A when resolving C', async () => {
    const p = pool(); const a = await p.acquire('A'); a.release()
    let release!: () => void; const cancel = vi.fn(() => release()); release = p.caches.retain(a.torrent, cancel)
    const b = await p.acquire('B'); b.release()
    const c = await p.acquire('C')
    expect(a.torrent.destroyed).toBe(false); expect(b.torrent.destroyed).toBe(true); expect(cancel).not.toHaveBeenCalled()
    c.release(); release(); await p.caches.shutdown()
  })
  it('protects issued and queued leases, rejects all busy and reuses without eviction', async () => {
    const p = pool(); const a = await p.acquire('A'); const issued = p.caches.reserve(a.torrent, 10000); a.release()
    const b = await p.acquire('B'); const queued = p.caches.reserve(b.torrent); b.release()
    await expect(p.acquire('C')).rejects.toThrow('TORRENT_CAPACITY_BUSY')
    const reused = await p.acquire('A'); await reused.fail()
    expect(a.torrent.destroyed).toBe(false); expect(b.torrent.destroyed).toBe(false)
    issued(); const c = await p.acquire('C'); expect(a.torrent.destroyed).toBe(true)
    queued(); c.release(); await p.caches.shutdown()
  })
  it('serializes concurrent acquisitions and preserves shared successful resolution on failure', async () => {
    const p = pool(); const [a, shared] = await Promise.all([p.acquire('A'), p.acquire('A')])
    const handedOff = p.caches.reserve(shared.torrent, 10000); shared.release(); await a.fail()
    expect(a.torrent.destroyed).toBe(false)
    const results = await Promise.allSettled([p.acquire('B'), p.acquire('C')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(p.torrents.filter(t => !t.destroyed)).toHaveLength(2)
    handedOff(); await p.caches.shutdown()
  })
  it('cleans an unused failed allocation and expires handoff leases', async () => {
    const p = pool(); const a = await p.acquire('A'); await a.fail(); expect(a.torrent.destroyed).toBe(true)
    const b = await p.acquire('B'); p.caches.reserve(b.torrent, 1); b.release()
    await new Promise(resolve => setTimeout(resolve, 10))
    const c = await p.acquire('C'); const d = await p.acquire('D'); expect(b.torrent.destroyed).toBe(true)
    c.release(); d.release(); await p.caches.shutdown()
  })
  it('forced shutdown clears passive timers but waits for real consumers', async () => {
    const p = pool(); const a = await p.acquire('A'); p.caches.reserve(a.torrent, 100000); a.release()
    let release!: () => void; const cancel = vi.fn(); release = p.caches.retain(a.torrent, cancel)
    const shutdown = p.caches.shutdown(); await Promise.resolve(); await Promise.resolve()
    expect(cancel).toHaveBeenCalled(); expect(a.torrent.destroyed).toBe(false)
    release(); await shutdown; expect(a.torrent.destroyed).toBe(true)
    await expect(p.acquire('B')).rejects.toThrow('closing')
  })
})
