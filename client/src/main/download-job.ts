import type { ChildProcess } from 'node:child_process'
import { copyFileSync, constants, existsSync, linkSync, rmSync, rmdirSync } from 'node:fs'

/** One transfer generation. A replacement must wait for this generation to settle. */
export class DownloadJob {
  private published = new Set<string>()
  private publishedDirectories = new Set<string>()
  own(path: string): void { this.published.add(path) }
  ownDirectory(path: string): void { this.publishedDirectories.add(path) }
  commit(): void { this.published.clear(); this.publishedDirectories.clear() }
  rollback(): void {
    for (const path of this.published) {
      try { rmSync(path, { force: true }) } catch {}
    }
    // Preserve files another writer may have added to our directory.
    for (const path of this.publishedDirectories) { try { rmdirSync(path) } catch {} }
    this.published.clear()
    this.publishedDirectories.clear()
  }
  readonly controller = new AbortController()
  done: Promise<void> = Promise.resolve()
  private children = new Map<ChildProcess, Promise<void>>()
  checkpoint(): void {
    if (this.controller.signal.aborted) throw new Error(String(this.controller.signal.reason))
  }
  stop(reason: 'paused' | 'cancelled'): void {
    if (!this.controller.signal.aborted) this.controller.abort(reason)
    for (const child of this.children.keys()) { try { child.kill('SIGKILL') } catch {} }
  }
  trackChild(child: ChildProcess): Promise<void> {
    let stderr = ''
    let failure: Error | undefined
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000) })
    // EPIPE can arrive independently of close and while no write is pending.
    child.stdin?.on('error', () => {})
    const exited = new Promise<void>((resolve, reject) => {
      child.once('error', (error) => { failure = error })
      child.once('close', (code) => {
        this.children.delete(child)
        if (this.controller.signal.aborted) reject(new Error(String(this.controller.signal.reason)))
        else if (failure) reject(failure)
        else if (code === 0) resolve()
        else reject(new Error('MP4 finalization failed: ' + (stderr.trim() || 'FFmpeg exited with code ' + code)))
      })
    })
    // A process can exit while its input producer is awaiting a write.
    void exited.catch(() => {})
    this.children.set(child, exited)
    if (this.controller.signal.aborted) { try { child.kill('SIGKILL') } catch {} }
    return exited
  }
  async settleChildren(): Promise<void> { await Promise.allSettled(this.children.values()) }
  async write(child: ChildProcess, data: Buffer): Promise<void> {
    this.checkpoint()
    const input = child.stdin
    if (!input || input.destroyed || input.writableEnded) throw new Error('FFmpeg input closed')
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        input.off('error', fail); input.off('close', closed); child.off('close', closed)
        this.controller.signal.removeEventListener('abort', aborted)
      }
      const fail = (error: Error) => { cleanup(); reject(error) }
      const closed = () => fail(new Error('FFmpeg input closed'))
      const aborted = () => fail(new Error(String(this.controller.signal.reason)))
      input.once('error', fail); input.once('close', closed); child.once('close', closed)
      this.controller.signal.addEventListener('abort', aborted, { once: true })
      input.write(data, (error) => { if (error) fail(error); else { cleanup(); resolve() } })
    })
    this.checkpoint()
  }
}

/** Publish with exclusive creation, so another job or user's file can never be replaced. */
export async function finalizePortable(job: DownloadJob, partial: string, preferred: string, ready: () => Promise<void>): Promise<string> {
  try {
    await ready()
    job.checkpoint()
    for (let suffix = 0; ; suffix++) {
      const target = suffix ? preferred.replace(/\.mp4$/i, ` (${suffix}).mp4`) : preferred
      if (['.jpg', '.kokomovie.json', '.subtitles'].some(ext => existsSync(target + ext))) continue
      try {
        try { linkSync(partial, target) } catch (error) {
          if (['EPERM', 'ENOTSUP', 'EXDEV'].includes((error as NodeJS.ErrnoException).code ?? '')) copyFileSync(partial, target, constants.COPYFILE_EXCL)
          else throw error
        }
        job.own(target)
        return target
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
  } finally { rmSync(partial, { force: true }) }
}
