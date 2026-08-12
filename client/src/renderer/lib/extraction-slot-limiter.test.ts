import { describe, expect, it } from 'vitest'
import { ExtractionSlotLimiter, type ReleaseExtractionSlot } from '../../main/stream-extractor/slot-limiter'

function requireRelease(release: ReleaseExtractionSlot | null): ReleaseExtractionSlot {
  expect(release).toBeTypeOf('function')
  return release!
}

describe('ExtractionSlotLimiter', () => {
  it('gives all seventeen enabled-provider simulations a turn without exceeding eight windows', async () => {
    const limiter = new ExtractionSlotLimiter(8)
    const granted: number[] = []
    const complete: Array<(() => void) | undefined> = []
    let active = 0
    let maxActive = 0

    const providers = Array.from({ length: 17 }, async (_, providerIndex) => {
      const release = requireRelease(await limiter.acquire())
      active += 1
      maxActive = Math.max(maxActive, active)
      granted.push(providerIndex)
      await new Promise<void>((resolve) => { complete[providerIndex] = resolve })
      active -= 1
      release()
    })

    await Promise.resolve()
    expect(granted).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(maxActive).toBe(8)

    for (let providerIndex = 0; providerIndex < 17; providerIndex += 1) {
      complete[providerIndex]!()
      await Promise.resolve()
      await Promise.resolve()
    }
    await Promise.all(providers)

    expect(granted).toEqual(Array.from({ length: 17 }, (_, index) => index))
    expect(maxActive).toBe(8)
  })

  it('bounds concurrency and grants queued requests in FIFO order', async () => {
    const limiter = new ExtractionSlotLimiter(2)
    const first = requireRelease(await limiter.acquire())
    const second = requireRelease(await limiter.acquire())
    const granted: string[] = []

    const thirdPromise = limiter.acquire().then((release) => {
      granted.push('third')
      return release
    })
    const fourthPromise = limiter.acquire().then((release) => {
      granted.push('fourth')
      return release
    })

    await Promise.resolve()
    expect(granted).toEqual([])

    first()
    const third = requireRelease(await thirdPromise)
    expect(granted).toEqual(['third'])

    second()
    const fourth = requireRelease(await fourthPromise)
    expect(granted).toEqual(['third', 'fourth'])

    third()
    fourth()
  })

  it('removes an aborted waiter without consuming the next released slot', async () => {
    const limiter = new ExtractionSlotLimiter(1)
    const first = requireRelease(await limiter.acquire())
    const controller = new AbortController()
    const abortedPromise = limiter.acquire(controller.signal)
    const nextPromise = limiter.acquire()

    controller.abort()
    expect(await abortedPromise).toBeNull()

    first()
    const next = requireRelease(await nextPromise)
    next()
  })

  it('makes each release idempotent so capacity cannot be overbooked', async () => {
    const limiter = new ExtractionSlotLimiter(1)
    const first = requireRelease(await limiter.acquire())
    const secondPromise = limiter.acquire()

    first()
    first()
    const second = requireRelease(await secondPromise)

    let thirdGranted = false
    const thirdPromise = limiter.acquire().then((release) => {
      thirdGranted = true
      return release
    })
    await Promise.resolve()
    expect(thirdGranted).toBe(false)

    second()
    const third = requireRelease(await thirdPromise)
    third()
  })

  it('rejects invalid concurrency limits', () => {
    expect(() => new ExtractionSlotLimiter(0)).toThrow(/positive integer/i)
    expect(() => new ExtractionSlotLimiter(1.5)).toThrow(/positive integer/i)
  })
})
