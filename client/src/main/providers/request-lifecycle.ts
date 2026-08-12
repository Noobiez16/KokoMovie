interface ActiveRequest {
  controller: AbortController
  timer: ReturnType<typeof setTimeout>
}

export interface ManagedProviderRequest {
  signal: AbortSignal
  finish: () => void
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
