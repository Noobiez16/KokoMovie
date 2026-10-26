export const PROVIDER_SWITCH_TIMEOUT_MS = 22_000
export const TORRENT_SWITCH_TIMEOUT_MS = 65_000
export const STARTUP_IDLE_TIMEOUT_MS = 12_000
export const STARTUP_MAX_TIMEOUT_MS = 45_000
export const TORRENT_SEEK_TIMEOUT_MS = 90_000

/** A stalled IPC promise must not retain an overlay or mutate a later playback session. */
export function withPlaybackDeadline<T>(operation: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', aborted)
      callback()
    }
    const aborted = () => finish(() => reject(new Error('PLAYBACK_CANCELLED')))
    // Attach both handlers even for an already-aborted operation: late failures are consumed.
    operation.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
    if (signal?.aborted) { aborted(); return }
    signal?.addEventListener('abort', aborted, { once: true })
    timer = setTimeout(() => finish(() => reject(new Error('PLAYBACK_TIMEOUT'))), timeoutMs)
  })
}

/** Resets on real byte/buffer progress, with a firm cap before the first frame. */
export class PlaybackProgressDeadline {
  private lastProgress: number
  private previous = 0
  constructor(private readonly started: number, private readonly idleMs: number, private readonly maximumMs: number) {
    this.lastProgress = started
  }
  expired(now: number, progress: number): boolean {
    if (Number.isFinite(progress) && progress > this.previous) { this.previous = progress; this.lastProgress = now }
    return now - this.started >= this.maximumMs || now - this.lastProgress >= this.idleMs
  }
}
