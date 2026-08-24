const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_RETRY_DELAY_MS = 30_000

interface QueuedRequest<T> {
  operation: () => Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

/** Coalesces equal requests and applies one shared concurrency ceiling. */
export class CoalescingRequestScheduler {
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private readonly queue: Array<QueuedRequest<unknown>> = []
  private active = 0

  constructor(private readonly maximumConcurrent: number) {
    if (!Number.isInteger(maximumConcurrent) || maximumConcurrent < 1) {
      throw new Error('maximumConcurrent must be a positive integer')
    }
  }

  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key)
    if (existing) return existing as Promise<T>

    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({ operation, resolve, reject } as QueuedRequest<unknown>)
      this.drain()
    })
    this.inFlight.set(key, promise)
    void promise.finally(() => this.inFlight.delete(key)).catch(() => {})
    return promise
  }

  private drain(): void {
    while (this.active < this.maximumConcurrent && this.queue.length > 0) {
      const request = this.queue.shift()!
      this.active++
      let result: Promise<unknown>
      try {
        result = request.operation()
      } catch (error) {
        result = Promise.reject(error)
      }
      void result
        .then(request.resolve, request.reject)
        .finally(() => {
          this.active--
          this.drain()
        })
    }
  }
}

function retryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const dateMs = Date.parse(value)
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : null
}

export function tmdbRetryDelayMs(
  status: number,
  retryAfter: string | null,
  attempt: number,
  nowMs = Date.now(),
): number | null {
  if (!RETRYABLE_STATUS_CODES.has(status)) return null
  const exponentialDelay = 1000 * (2 ** Math.max(0, attempt))
  return Math.min(Math.max(exponentialDelay, retryAfterMs(retryAfter, nowMs) ?? 0), MAX_RETRY_DELAY_MS)
}
