import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IpcMainInvokeEvent } from 'electron'

const boundary = vi.hoisted(() => ({ root: '', handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({
  app: { getPath: () => boundary.root, getVersion: () => '2.0.0' },
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => boundary.handlers.set(name, handler) },
  BrowserWindow: { getAllWindows: () => [] }, dialog: {},
}))
import { getDb } from '../../main/db/sqlite'
import { registerLibraryIpc } from '../../main/ipc/library'
import { setTrustedRendererWebContentsId } from '../../main/ipc/security'
import { applyPayload, buildPayload } from '../../main/ipc/library-portability'
import { libraryExportSchema } from '../../main/library-portability'

const frame = { url: 'http://localhost:5173/' }
const event = { sender: { id: 8, mainFrame: frame }, senderFrame: frame } as unknown as IpcMainInvokeEvent
const invoke = (channel: string, ...args: unknown[]) => boundary.handlers.get(channel)!(event, ...args)
const like = { contentId: 'movie-1', contentType: 'movie', liked: true }
beforeAll(async () => {
  boundary.root = await mkdtemp(join(tmpdir(), 'kokomovie-likes-'))
  setTrustedRendererWebContentsId(8, frame.url)
  registerLibraryIpc()
})
beforeEach(() => { getDb().exec('DELETE FROM likes; DELETE FROM watchlist; DELETE FROM playback_positions') })
afterAll(async () => { getDb().close(); setTrustedRendererWebContentsId(null); await rm(boundary.root, { recursive: true, force: true }) })

describe('local likes and portability', () => {
  it('persists a like through real registered IPC without modifying the watchlist', () => {
    invoke('library:watchlist:add', 'saved-1', 'movie')
    invoke('library:likes:set', like)
    invoke('library:likes:set', like)
    expect(invoke('library:likes:list')).toEqual([expect.objectContaining({ content_id: 'movie-1', content_type: 'movie' })])
    expect(invoke('library:watchlist:list')).toHaveLength(1)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM likes').get()).toEqual({ count: 1 })
    invoke('library:likes:set', { ...like, liked: false })
    expect(invoke('library:likes:list')).toEqual([])
  })
  it('rejects hostile senders and invalid like payloads before writing', () => {
    expect(() => invoke('library:likes:set', { ...like, liked: 'true' })).toThrow('Invalid IPC request')
    expect(() => invoke('library:likes:set', { ...like, path: '/arbitrary' })).toThrow('Invalid IPC request')
    expect(() => boundary.handlers.get('library:likes:set')!({ sender: { id: 9 }, senderFrame: frame }, like)).toThrow('Untrusted IPC sender')
    expect(invoke('library:likes:list')).toEqual([])
  })
  it('round-trips likes and merges only newer timestamps', () => {
    invoke('library:likes:set', like)
    const payload = buildPayload(false)
    expect(payload.library.likes).toHaveLength(1)
    getDb().exec('DELETE FROM likes')
    expect(applyPayload(payload, 'merge').likes).toBe(1)
    const older = libraryExportSchema.parse({ ...payload, library: { ...payload.library, likes: [{ ...payload.library.likes![0], updated_at: '2020-01-01T00:00:00Z' }] } })
    expect(applyPayload(older, 'merge').likes).toBe(0)
    expect(invoke('library:likes:list')[0].updated_at).toBe(payload.library.likes![0]!.updated_at)
  })
  it('imports older exports without likes and preserves merge/replace semantics', () => {
    invoke('library:likes:set', like)
    const payload = buildPayload(false)
    delete payload.library.likes
    applyPayload(libraryExportSchema.parse(payload), 'merge')
    expect(invoke('library:likes:list')).toHaveLength(1)
    applyPayload(payload, 'replace')
    expect(invoke('library:likes:list')).toEqual([])
  })
})
