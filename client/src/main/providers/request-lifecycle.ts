interface ActiveRequest {
  controller: AbortController
  timer: ReturnType<typeof setTimeout>
}

export interface ManagedProviderRequest {
  signal: AbortSignal
  finish: () => void
}

/** Covers async operations (such as DNS) whose callback API has no AbortSignal. */
export function abortableProviderOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(new Error('Provider request cancelled or timed out')) }
    const cleanup = () => signal.removeEventListener('abort', aborted)
    operation.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
    if (signal.aborted) { aborted(); return }
    signal.addEventListener('abort', aborted, { once: true })
  })
}

/** Keeps at most one bounded direct-provider extraction per renderer. */
export class SupersedingRequestRegistry {
  private readonly active = new Map<number, ActiveRequest>()

  begin(rendererId: number, deadlineMs: number): ManagedProviderRequest {
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
      throw new Error('Provider request deadline must be positive')
    }

    this.abort(rendererId)
    const controller = new AbortController()
    const entry: ActiveRequest = {
      controller,
      timer: setTimeout(() => controller.abort(), deadlineMs),
    }
    this.active.set(rendererId, entry)

    let finished = false
    return {
      signal: controller.signal,
      finish: () => {
        if (finished) return
        finished = true
        clearTimeout(entry.timer)
        if (this.active.get(rendererId) === entry) this.active.delete(rendererId)
      },
    }
  }

  abort(rendererId: number): void {
    const entry = this.active.get(rendererId)
    if (!entry) return
    this.active.delete(rendererId)
    clearTimeout(entry.timer)
    entry.controller.abort()
  }
}
