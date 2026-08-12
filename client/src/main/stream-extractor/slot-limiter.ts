export type ReleaseExtractionSlot = () => void

interface SlotWaiter {
  resolve: (release: ReleaseExtractionSlot | null) => void
  signal?: AbortSignal
  onAbort?: () => void
  settled: boolean
}

/**
 * FIFO concurrency limiter for hidden extraction windows.
 *
 * Waiting requests are cancellable so a completed provider race cannot leave stale work queued.
 * Each granted release function is idempotent, which keeps capacity correct when several Electron
 * teardown events report the same window as finished.
 */
export class ExtractionSlotLimiter {
  private active = 0
  private readonly waiters: SlotWaiter[] = []

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('Extraction concurrency limit must be a positive integer')
    }
  }

  acquire(signal?: AbortSignal): Promise<ReleaseExtractionSlot | null> {
    if (signal?.aborted) return Promise.resolve(null)

    if (this.active < this.limit) {
      this.active += 1
      return Promise.resolve(this.createRelease())
    }

    return new Promise((resolve) => {
      const waiter: SlotWaiter = { resolve, signal, settled: false }
      if (signal) {
        waiter.onAbort = () => {
          if (waiter.settled) return
          waiter.settled = true
          const index = this.waiters.indexOf(waiter)
          if (index >= 0) this.waiters.splice(index, 1)
          signal.removeEventListener('abort', waiter.onAbort!)
          resolve(null)
        }
        signal.addEventListener('abort', waiter.onAbort, { once: true })
      }
      this.waiters.push(waiter)
    })
  }

  private createRelease(): ReleaseExtractionSlot {
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      this.grantWaitingSlots()
    }
  }

  private grantWaitingSlots(): void {
    while (this.active < this.limit && this.waiters.length > 0) {
      const waiter = this.waiters.shift()!
      if (waiter.settled) continue

      waiter.settled = true
      if (waiter.onAbort && waiter.signal) {
        waiter.signal.removeEventListener('abort', waiter.onAbort)
      }
      if (waiter.signal?.aborted) {
        waiter.resolve(null)
        continue
      }

      this.active += 1
      waiter.resolve(this.createRelease())
    }
  }
}
