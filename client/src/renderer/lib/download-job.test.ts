import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, it, expect } from 'vitest'
import { DownloadJob, finalizePortable } from '../../main/download-job'

const mp4 = Buffer.from('0000ftyp00000000')
describe('portable finalization lifecycle', () => {
  it('rollback removes owned media while preserving unregistered sidecars', () => {
    const root = mkdtempSync(join(tmpdir(), 'km-final-'))
    try {
      const path = join(root, 'Film.mp4')
      const job = new DownloadJob()
      writeFileSync(path, mp4)
      job.own(path)
      writeFileSync(path + '.jpg', 'external artwork')
      job.rollback()
      expect(readdirSync(root)).toEqual(['Film.mp4.jpg'])
      expect(readFileSync(path + '.jpg', 'utf8')).toBe('external artwork')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('publishes concurrent equal titles without overwriting an existing file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'km-final-'))
    try {
      writeFileSync(join(root, 'Film.mp4'), 'user file')
      const run = (id: string) => {
        const partial = join(root, id + '.partial')
        writeFileSync(partial, mp4)
        return finalizePortable(new DownloadJob(), partial, join(root, 'Film.mp4'), async () => {})
      }
      const results = await Promise.all([run('one'), run('two')])
      expect(results.every(path => path.endsWith('.mp4'))).toBe(true)
      expect(readdirSync(root).some(name => name.endsWith('.partial'))).toBe(false)
      expect(results[0]).not.toBe(results[1])
      expect(readFileSync(join(root, 'Film.mp4'), 'utf8')).toBe('user file')
      for (const path of results) expect(readFileSync(path)).toEqual(mp4)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('cancels while artwork settles without publishing a portable file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'km-final-'))
    try {
      const job = new DownloadJob()
      const partial = join(root, 'job.partial')
      writeFileSync(partial, mp4)
      let release!: () => void
      const result = finalizePortable(job, partial, join(root, 'Film.mp4'), () => new Promise<void>(r => { release = r }))
      job.stop('paused')
      release()
      await expect(result).rejects.toThrow('paused')
      expect(readdirSync(root)).toEqual([])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('kills FFmpeg and rejects blocked stdin writes when cancellation arrives', async () => {
    const job = new DownloadJob()
    const child = new EventEmitter() as any
    child.stdin = new PassThrough({ highWaterMark: 1 })
    child.stderr = new PassThrough()
    child.kill = () => { queueMicrotask(() => child.emit('close', null)); return true }
    const exited = job.trackChild(child)
    const write = job.write(child, Buffer.alloc(100))
    job.stop('cancelled')
    await expect(write).rejects.toThrow('cancelled')
    await expect(exited).rejects.toThrow('cancelled')
  })
})
