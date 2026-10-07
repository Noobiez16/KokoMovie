import { mkdtempSync, realpathSync } from 'fs'
import { rm, rmdir } from 'fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'path'

interface CacheEntry {
  path: string
  torrent?: any
  resources: Map<() => void, () => Promise<void>>
  reservations: Set<() => void>
  disposal?: Promise<void>
  storeDone?: Promise<void>
  storeError?: Error
}

/** Owns only directories allocated during this process; never scans temp directories. */
export class TorrentCacheLifecycle {
  private readonly root: string
  private readonly entries = new Map<string, CacheEntry>()
  private readonly torrents = new Map<any, CacheEntry>()
  private acquisition: Promise<unknown> = Promise.resolve()
  private closing = false
  constructor(root: string, private readonly capacity = 4) { this.root = realpathSync(root) }

  allocate(): string {
    const path = mkdtempSync(join(this.root, 'torrent-'))
    this.entries.set(path, { path, resources: new Map(), reservations: new Set() })
    return path
  }

  /** Serialize lookup + eviction + creation, but not metadata/probing work. */
  acquire(find: () => Promise<any>, create: () => any): Promise<{ torrent: any; release: () => void; fail: () => Promise<void> }> {
    const operation = this.acquisition.then(async () => {
      if (this.closing) throw new Error('Torrent cache is closing')
      let torrent = await find()
      if (this.closing) throw new Error('Torrent cache is closing')
      if (torrent?.destroyed) torrent = null
      const created = !torrent
      if (!torrent) {
        if (this.torrents.size >= this.capacity) {
          const idle = [...this.torrents.entries()].find(([, entry]) => this.idle(entry))
          if (!idle) throw new Error('TORRENT_CAPACITY_BUSY')
          await this.dispose(idle[0])
        }
        if (this.closing) throw new Error('Torrent cache is closing')
        torrent = await create()
      }
      const release = this.reserve(torrent)
      return { torrent, release, fail: async () => {
        release()
        // A failing reuse never owns the shared allocation. A newly created entry
        // can be removed only if no overlapping resolver or consumer owns it.
        const entry = this.torrents.get(torrent)
        if (created && entry && this.idle(entry)) await this.dispose(torrent)
      } }
    })
    this.acquisition = operation.catch(() => {})
    return operation
  }

  private idle(entry: CacheEntry): boolean {
    return !entry.disposal && entry.resources.size === 0 && entry.reservations.size === 0
  }

  /** Passive ownership: forced teardown clears these without awaiting a consumer. */
  reserve(torrent: any, ttlMs?: number): () => void {
    const entry = this.torrents.get(torrent)
    if (this.closing || !entry || entry.disposal || torrent.destroyed) throw new Error('Torrent cache is closing')
    let timer: ReturnType<typeof setTimeout> | undefined
    const release = () => { clearTimeout(timer); entry.reservations.delete(release) }
    entry.reservations.add(release)
    if (ttlMs !== undefined) { timer = setTimeout(release, ttlMs); timer.unref?.() }
    return release
  }

  // Observe the actual store callback, including WebTorrent's internal error teardown.
  storeConstructor(path: string, Store: any): any {
    const entry = this.owned(path)
    return class extends Store {
      constructor(...args: any[]) {
        const options = args[1]
        if (resolve(options.path) !== path) throw new Error('Refusing unowned torrent store path')
        for (const file of options.files ?? []) {
          const child = relative(path, resolve(join(path, file.path)))
          if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
            throw new Error('Refusing unowned torrent file path')
          }
        }
        super(...args)
        let complete!: () => void
        entry.storeDone = new Promise<void>((done) => { complete = done })
        const close = this['close'].bind(this)
        // fs-chunk-store.destroy removes paths itself. Close its handles here, then
        // let the registry perform the only recursive deletion after consumers close.
        this['destroy'] = (callback: (err?: Error) => void) => {
          const resources = [...entry.resources.values()].map((cancel) => cancel())
          void Promise.all(resources).then(() => close((err?: Error) => {
            entry.storeError = err
            complete()
            callback?.(err)
          }))
        }
      }
    }
  }

  attach(path: string, torrent: any): void {
    const entry = this.owned(path)
    entry.torrent = torrent
    this.torrents.set(torrent, entry)
  }

  retain(torrent: any, cancel: () => void): () => void {
    const entry = this.torrents.get(torrent)
    if (!entry || entry.disposal || torrent.destroyed) throw new Error('Torrent cache is closing')
    let release!: () => void
    const done = new Promise<void>((resolveDone) => { release = () => { entry.resources.delete(cancel); resolveDone() } })
    entry.resources.set(cancel, () => { cancel(); return done })
    return release
  }

  dispose(torrent: any): Promise<void> {
    const entry = this.torrents.get(torrent)
    if (!entry) return Promise.resolve()
    if (entry.disposal) return entry.disposal
    for (const release of entry.reservations) release()
    entry.disposal = Promise.resolve().then(async () => {
      const resources = [...entry.resources.values()].map((cancel) => cancel())
      await Promise.all(resources)
      if (!torrent.destroyed) {
        await new Promise<void>((done, reject) => {
          try { torrent.destroy({ destroyStore: true }, (err?: Error) => err ? reject(err) : done()) }
          catch (err) { reject(err) }
        })
      }
      await entry.storeDone
      if (entry.storeError) throw entry.storeError
      await this.discard(entry.path)
      this.torrents.delete(torrent)
    }).catch((err) => { entry.disposal = undefined; throw err })
    return entry.disposal
  }

  private owned(path: string): CacheEntry {
    const absolute = resolve(path)
    const child = relative(this.root, absolute)
    const entry = this.entries.get(absolute)
    if (!isAbsolute(path) || !entry || !child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
      throw new Error('Refusing unowned torrent cache path')
    }
    // A replaced directory/junction must not authorize deletion elsewhere.
    try { if (realpathSync(absolute) !== absolute) throw new Error('Refusing unowned torrent cache link') }
    catch (err: any) { if (err.code !== 'ENOENT') throw err }
    return entry
  }

  async discard(path: string): Promise<void> {
    const entry = this.owned(path)
    await rm(entry.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    this.entries.delete(entry.path)
  }

  async shutdown(): Promise<void> {
    this.closing = true
    await this.acquisition
    await Promise.all([...this.torrents.keys()].map((torrent) => this.dispose(torrent)))
    await Promise.all([...this.entries.values()].filter((entry) => !entry.torrent).map((entry) => this.discard(entry.path)))
    // rmdir is deliberately nonrecursive: unknown contents are never removed.
    await rmdir(this.root)
  }
}

export interface TorrentAudioTrack { streamIndex: number; lang: string }

/** A successful input EOF must leave FFmpeg time to emit its stream table. */
export function probeTorrentAudio(
  file: any,
  spawnProbe: () => import('child_process').ChildProcess,
  retain: (cancel: () => void) => () => void,
  normalizeTag: (tag: string) => string,
  timeoutMs = 15_000,
): Promise<TorrentAudioTrack[]> {
  return new Promise((resolveProbe) => {
    let input: any = null
    let child: import('child_process').ChildProcess | null = null
    let closed = false
    let settled = false
    let tracks: TorrentAudioTrack[] = []
    let output = ''
    let release: (() => void) | undefined
    const finish = (result: TorrentAudioTrack[]) => {
      if (settled) return
      settled = true
      tracks = result
      clearTimeout(timer)
      try { input?.destroy?.() } catch { /* ignore */ }
      if (child && !closed) { try { child.kill('SIGKILL') } catch { /* ignore */ } }
      if (!child || closed) resolveProbe(tracks)
    }
    const timer = setTimeout(() => finish([]), timeoutMs)
    try {
      const limit = 8 * 1024 * 1024
      input = file.createReadStream({ start: 0, end: Math.min((file.length ?? limit) - 1, limit - 1) })
      child = spawnProbe()
      child.once('close', () => {
        closed = true
        release?.()
        if (settled) { resolveProbe(tracks); return }
        const result: TorrentAudioTrack[] = []
        const pattern = /Stream #\d+:(\d+)(?:\[[^\]]*\])?(?:\(([A-Za-z]{2,3})\))?: Audio:/g
        for (let match = pattern.exec(output); match; match = pattern.exec(output)) {
          result.push({ streamIndex: Number(match[1]), lang: normalizeTag(match[2] ?? '') })
        }
        finish(result)
      })
      child.on('error', () => finish([]))
      release = retain(() => finish([]))
      child.stderr?.on('data', (data) => { output = (output + data.toString()).slice(-16_000) })
      let ended = false
      input.once('end', () => { ended = true })
      input.once('close', () => { if (!ended) finish([]) })
      input.on('error', () => finish([]))
      child.stdin?.on('error', () => { /* EPIPE when FFmpeg finishes reading its header */ })
      input.pipe(child.stdin!)
    } catch { finish([]) }
  })
}
