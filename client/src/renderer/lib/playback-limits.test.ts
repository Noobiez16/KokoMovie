import { afterEach, expect, it, vi } from 'vitest'
import { withPlaybackDeadline, PlaybackProgressDeadline } from './playback-limits'

afterEach(() => vi.useRealTimers())
it('settles a hung operation at its deadline and ignores a late rejection', async () => {
  vi.useFakeTimers()
  let reject!: (reason: Error) => void
  const result = withPlaybackDeadline(new Promise<void>((_resolve, fail) => { reject = fail }), 1000)
  const assertion = expect(result).rejects.toThrow('PLAYBACK_TIMEOUT')
  await vi.advanceTimersByTimeAsync(1000)
  await assertion
  reject(new Error('late failure'))
  await Promise.resolve()
  expect(vi.getTimerCount()).toBe(0)
})
it('cancels immediately, clears timers, and removes settled abort listeners', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const remove = vi.spyOn(controller.signal, 'removeEventListener')
  const pending = withPlaybackDeadline(new Promise(() => {}), 1000, controller.signal)
  const assertion = expect(pending).rejects.toThrow('PLAYBACK_CANCELLED')
  controller.abort(); await assertion
  expect(vi.getTimerCount()).toBe(0)
  expect(remove).toHaveBeenCalled()
})
it('leaves no deadline behind after success or failure', async () => {
  vi.useFakeTimers()
  await expect(withPlaybackDeadline(Promise.resolve('ready'), 1000)).resolves.toBe('ready')
  await expect(withPlaybackDeadline(Promise.reject(new Error('failed')), 1000)).rejects.toThrow('failed')
  expect(vi.getTimerCount()).toBe(0)
})
it('bounds no-progress startup while allowing genuine buffer/byte progress and an absolute cap', () => {
  const deadline = new PlaybackProgressDeadline(0, 12000, 45000)
  expect(deadline.expired(11000, 0)).toBe(false)
  expect(deadline.expired(12000, 1024)).toBe(false)
  expect(deadline.expired(23000, 1024)).toBe(false)
  expect(deadline.expired(24000, 1024)).toBe(true)
  const trickle = new PlaybackProgressDeadline(0, 12000, 45000)
  for (let now = 10000; now <= 40000; now += 10000) expect(trickle.expired(now, now)).toBe(false)
  expect(trickle.expired(45000, 50000)).toBe(true)
})
