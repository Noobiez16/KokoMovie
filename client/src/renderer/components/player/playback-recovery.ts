export interface PlaybackRecoveryPatch {
  initialLoading: boolean
  awaitingFallback: boolean
  hlsError: string | null
}

export type PlaybackRecoveryEvent = 'playing'

export class PlaybackRecoveryDeadline {
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private recovered = false

  start(onExpire: () => void, delayMs: number): void {
    this.cancel()
    this.recovered = false
    const generation = this.generation
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.recovered || generation !== this.generation) return
      onExpire()
    }, delayMs)
  }

  markPlaying(): void {
    this.recovered = true
    this.cancel()
  }

  cancel(): void {
    this.generation += 1
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

/** The media element rendering frames is authoritative proof that the current source recovered. */
export function getPlaybackRecoveryPatch(
  event: PlaybackRecoveryEvent,
): PlaybackRecoveryPatch {
  if (event === 'playing') {
    return {
      initialLoading: false,
      awaitingFallback: false,
      hlsError: null,
    }
  }
  throw new Error(`Unsupported playback recovery event: ${event}`)
}
