import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import https from 'node:https'
import { Writable, PassThrough, Readable } from 'node:stream'
const state = vi.hoisted(() => ({ db: null as any, root: '', handlers: new Map<string, any>(), children: [] as any[], blockInput: false, delayKill: false, sidecarCollision: '', artwork: undefined as undefined | (() => Promise<any>) }))
vi.mock('../../main/download-job', async importOriginal => {
  const original = await importOriginal<typeof import('../../main/download-job')>()
  return { ...original, finalizePortable: async (...args: Parameters<typeof original.finalizePortable>) => {
    const target = await original.finalizePortable(...args)
    if (state.sidecarCollision) writeFileSync(target + state.sidecarCollision, 'external asset')
    return target
  } }
})
vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, handler: any) => state.handlers.set(name, handler) },
  app: { getPath: () => state.root }, BrowserWindow: { getAllWindows: () => [] }, dialog: {}, shell: {},
  net: { fetch: () => state.artwork!() },
}))
vi.mock('../../main/db/sqlite', () => ({ getDb: () => state.db }))
vi.mock('../../main/ffmpeg', () => ({ FFMPEG_BIN: 'fixture-ffmpeg' }))
vi.mock('../../main/ipc/security', () => ({ trustedIpcHandler: (handler: any) => handler, PublicIpcError: Error }))
vi.mock('../../main/ipc/providers', () => ({
  getStreamHeaders: () => ({}), getStreamProxyPort: () => 0,
  mergeHeadersCaseInsensitive: (...headers: any[]) => Object.assign({}, ...headers), validateDownloadSourceUrl: () => {},
}))
vi.mock('../../main/hls-download-plan', () => ({
  createHlsDownloadPlan: async () => ({ video: { objects: [{ uri: 'https://fixture.test/seg', kind: 'segment' }] } }),
  materializeHlsObject: async () => Buffer.from('fixture segment'), UnsupportedHlsError: Error,
}))
vi.mock('child_process', () => ({ spawn: (_binary: string, args: string[]) => {
  const child = new EventEmitter() as any
  child.stdin = new Writable({ write(_chunk, _encoding, callback) { if (!state.blockInput) callback() } })
  child.stderr = new PassThrough()
  child.finish = () => { writeFileSync(args.at(-1)!, Buffer.from('0000ftyp00000000')); child.emit('close', 0) }
  child.completeKill = () => child.emit('close', null)
  child.kill = vi.fn(() => { if (!state.delayKill) queueMicrotask(child.completeKill); return true })
  state.children.push(child)
  return child
} }))
let downloads: typeof import('../../main/ipc/download')
const call = (name: string, payload?: any) => state.handlers.get('download:' + name)({}, payload)
const start = (extra = {}) => call('start', { contentId: 'fixture', title: 'Film', contentType: 'movie', manifestUrl: 'https://fixture.test/main.m3u8', customDownloadPath: state.root, ...extra })
const row = (id: string) => state.db.prepare('SELECT * FROM downloads WHERE id = ?').get(id)
beforeEach(async () => {
  vi.resetModules()
  state.root = mkdtempSync(join(tmpdir(), 'km-ipc-'))
  state.handlers.clear(); state.children = []; state.artwork = undefined; state.blockInput = false; state.delayKill = false; state.sidecarCollision = ''
  state.db = new DatabaseSync(':memory:')
  const schema = readFileSync(resolve(process.cwd(), 'src/main/db/sqlite.ts'), 'utf8').match(/CREATE TABLE IF NOT EXISTS downloads \([\s\S]+?\);/)![0]
  state.db.exec(schema)
  state.db.backup = async () => {}
  downloads = await import('../../main/ipc/download')
  downloads.registerDownloadIpc()
  await new Promise(resolve => setTimeout(resolve, 0))
})
afterEach(async () => {
  await downloads.shutdownDownloadJobs()
  vi.restoreAllMocks()
  state.db.close()
  rmSync(state.root, { recursive: true, force: true })
})
describe('download IPC finalization with real staging and SQLite', () => {
  it.each(['.jpg', '.kokomovie.json'])('preserves external %s created after media allocation', async suffix => {
    state.sidecarCollision = suffix
    const { id } = await start()
    writeFileSync(join(state.root, id, 'artwork.jpg'), 'download artwork')
    await vi.waitFor(() => expect(state.children).toHaveLength(1))
    state.children[0].finish()
    await vi.waitFor(() => expect(row(id).status).toBe('error'))
    expect(readFileSync(join(state.root, 'Film.mp4') + suffix, 'utf8')).toBe('external asset')
    expect(existsSync(join(state.root, 'Film.mp4'))).toBe(false)
  })
  it('cancels a direct MP4 while FFmpeg stdin is blocked and removes its work', async () => {
    state.blockInput = true
    vi.spyOn(https, 'get').mockImplementation(((_url: any, _options: any, callback: any) => {
      const request = new EventEmitter() as any
      request.setTimeout = () => {}
      request.destroy = (error: Error) => request.emit('error', error)
      queueMicrotask(() => {
        const response = Readable.from([Buffer.from('0000ftyp00000000')]) as any
        response.statusCode = 200; response.headers = { 'content-length': '16' }
        callback(response)
      })
      return request
    }) as any)
    const { id } = await start({ manifestUrl: 'https://fixture.test/video.mp4' })
    await vi.waitFor(() => expect(state.children).toHaveLength(1))
    expect(await call('pause', id)).toMatchObject({ ok: false })
    await call('cancel', id)
    expect(state.children[0].kill).toHaveBeenCalled()
    expect(row(id).status).toBe('cancelled')
    expect(existsSync(join(state.root, id))).toBe(false)
    expect(readdirSync(state.root).some(name => name.endsWith('.mp4'))).toBe(false)
  })
  it('pauses FFmpeg, retains encrypted staging, then resumes only after old teardown', async () => {
    const { id } = await start()
    await vi.waitFor(() => expect(state.children).toHaveLength(1))
    state.delayKill = true
    const paused = call('pause', id)
    const resumed = call('resume', id)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(state.children).toHaveLength(1)
    state.children[0].completeKill()
    state.delayKill = false
    await paused; await resumed
    await vi.waitFor(() => expect(state.children).toHaveLength(2))
    expect(state.children[0].kill).toHaveBeenCalled()
    expect(existsSync(join(state.root, id, 'seg_0.enc'))).toBe(true)
    expect(row(id).status).toBe('downloading')
    state.children[1].finish()
    await vi.waitFor(() => expect(row(id).status).toBe('completed'))
    expect(existsSync(row(id).manifest_path)).toBe(true)
    expect(existsSync(join(state.root, id))).toBe(false)
  })
  it.each(['cancel', 'delete'])('%s while artwork is pending cannot publish or resurrect the row', async operation => {
    let release!: (value: any) => void
    state.artwork = () => new Promise(resolve => { release = resolve })
    const { id } = await start({ thumbnailUrl: 'catalog-cache://fixture/artwork' })
    await vi.waitFor(() => expect(state.children).toHaveLength(1))
    state.children[0].finish()
    const stopped = call(operation, id)
    release({ ok: true, headers: { get: () => '3' }, arrayBuffer: async () => new Uint8Array([1,2,3]).buffer })
    await stopped
    expect(row(id)?.status).toBe(operation === 'cancel' ? 'cancelled' : undefined)
    expect(readdirSync(state.root).filter(name => name.endsWith('.mp4') || name === id)).toEqual([])
  })
  it('finalizes simultaneous equal titles into two distinct complete movies', async () => {
    const first = await start(); const second = await start()
    await vi.waitFor(() => expect(state.children).toHaveLength(2))
    state.children.forEach(child => child.finish())
    await vi.waitFor(() => expect([row(first.id).status, row(second.id).status]).toEqual(['completed', 'completed']))
    expect(row(first.id).manifest_path).not.toBe(row(second.id).manifest_path)
    for (const id of [first.id, second.id]) expect(readFileSync(row(id).manifest_path).subarray(4,8).toString()).toBe('ftyp')
  })
  it('pauses while decrypted input is being prepared and retains encrypted segments', async () => {
    const { id } = await start()
    await new Promise<void>(resolve => setImmediate(resolve))
    await call('pause', id)
    expect(row(id).status).toBe('paused')
    expect(existsSync(join(state.root, id, 'seg_0.enc'))).toBe(true)
    expect(existsSync(join(state.root, id, 'video-input.partial'))).toBe(false)
    expect(state.children).toHaveLength(0)
  })
  it('shutdown waits for FFmpeg and preserves resumable encrypted work', async () => {
    const { id } = await start()
    await vi.waitFor(() => expect(state.children).toHaveLength(1))
    await downloads.shutdownDownloadJobs()
    expect(state.children[0].kill).toHaveBeenCalled()
    expect(row(id).status).toBe('pending')
    expect(existsSync(join(state.root, id, 'seg_0.enc'))).toBe(true)
    expect(readdirSync(join(state.root, id)).some(name => name.endsWith('.partial'))).toBe(false)
  })
  it('expiry never recursively deletes an unrelated imported directory', async () => {
    const { id } = await start()
    await call('pause', id)
    writeFileSync(join(state.root, 'personal.txt'), 'keep')
    state.db.prepare("UPDATE downloads SET local_dir = ?, expires_at = '2000-01-01' WHERE id = ?").run(state.root, id)
    await downloads.purgeExpiredDownloads()
    expect(readFileSync(join(state.root, 'personal.txt'), 'utf8')).toBe('keep')
    expect(row(id)).toBeUndefined()
  })
  it('expiry preserves a download that finishes while another expired job tears down', async () => {
    const first = await start(); const second = await start()
    await vi.waitFor(() => expect(state.children).toHaveLength(2))
    state.db.prepare("UPDATE downloads SET expires_at = '2000-01-01'").run()
    state.delayKill = true
    const purged = downloads.purgeExpiredDownloads()
    await vi.waitFor(() => expect(state.children[0].kill).toHaveBeenCalled())
    state.children[1].finish()
    await vi.waitFor(() => expect(row(second.id)?.status).toBe('completed'))
    const completed = row(second.id)
    state.delayKill = false
    state.children[0].completeKill()
    await purged
    expect(row(first.id)).toBeUndefined()
    expect(row(second.id)).toEqual(completed)
    expect(state.children[1].kill).not.toHaveBeenCalled()
    expect(existsSync(completed.manifest_path)).toBe(true)
  })
  it('concurrent finalizers preserve existing movies and expired completed downloads', async () => {
    writeFileSync(join(state.root, 'Film.mp4'), 'personal movie')
    const first = await start(); const second = await start()
    await vi.waitFor(() => expect(state.children).toHaveLength(2))
    state.children.forEach(child => child.finish())
    await vi.waitFor(() => expect([row(first.id).status, row(second.id).status]).toEqual(['completed', 'completed']))
    expect(row(first.id).manifest_path).not.toBe(row(second.id).manifest_path)
    expect(readFileSync(join(state.root, 'Film.mp4'), 'utf8')).toBe('personal movie')
    state.db.prepare("UPDATE downloads SET expires_at = '2000-01-01'").run()
    await downloads.purgeExpiredDownloads()
    expect(row(first.id).status).toBe('completed')
    expect(existsSync(row(first.id).manifest_path)).toBe(true)
    await call('delete', first.id)
    expect(existsSync(row(second.id).manifest_path)).toBe(true)
  })
})
