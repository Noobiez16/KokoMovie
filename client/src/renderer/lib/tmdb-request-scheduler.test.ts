import { describe, expect, it, vi } from 'vitest'
import { CoalescingRequestScheduler, tmdbRetryDelayMs } from '../../main/tmdb-request-scheduler'

describe('TMDB request scheduling', () => {
  it('coalesces identical in-flight requests', async () => {
    const scheduler = new CoalescingRequestScheduler(3)
    let release!: (value: string) => void
    const operation = vi.fn(() => new Promise<string>((resolve) => { release = resolve }))
    const first = scheduler.run('same-key', operation)
    const second = scheduler.run('same-key', operation)
    release('ok')
    await expect(Promise.all([first, second])).resolves.toEqual(['ok', 'ok'])
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('never exceeds the configured concurrency', async () => {
    const scheduler = new CoalescingRequestScheduler(2)
    let active = 0
    let maximum = 0
    const releases: Array<() => void> = []
    const jobs = Array.from({ length: 5 }, (_, index) => scheduler.run(`key-${index}`, async () => {
      active++
      maximum = Math.max(maximum, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active--
      return index
    }))
    await vi.waitFor(() => expect(releases.length).toBe(2))
    while (releases.length) {
      releases.shift()!()
      await Promise.resolve()
      await Promise.resolve()
    }
    await Promise.all(jobs)
    expect(maximum).toBe(2)
  })

  it('honors Retry-After and bounds exponential retry delays', () => {
    expect(tmdbRetryDelayMs(429, '3', 0, 0)).toBe(3000)
    expect(tmdbRetryDelayMs(503, null, 2, 0)).toBe(4000)
    expect(tmdbRetryDelayMs(404, null, 0, 0)).toBeNull()
    expect(tmdbRetryDelayMs(429, '120', 5, 0)).toBe(30_000)
  })
})
