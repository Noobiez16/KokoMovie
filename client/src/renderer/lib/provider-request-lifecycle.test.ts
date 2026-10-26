import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupersedingRequestRegistry, abortableProviderOperation } from '../../main/providers/request-lifecycle'

afterEach(() => vi.useRealTimers())

describe('SupersedingRequestRegistry', () => {
  it('settles a DNS callback that never returns when the request expires', async () => {
    vi.useFakeTimers()
    const request = new SupersedingRequestRegistry().begin(7, 1000)
    const pending = abortableProviderOperation(new Promise(() => {}), request.signal)
    const assertion = expect(pending).rejects.toThrow('Provider request cancelled or timed out')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    request.finish()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('aborts the previous request for the same renderer', () => {
    const registry = new SupersedingRequestRegistry()
    const first = registry.begin(7, 20_000)
    const second = registry.begin(7, 20_000)

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    second.finish()
  })

  it('applies the deadline to queue waiting and active extraction alike', () => {
    vi.useFakeTimers()
    const registry = new SupersedingRequestRegistry()
    const request = registry.begin(7, 20_000)

    vi.advanceTimersByTime(19_999)
    expect(request.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(request.signal.aborted).toBe(true)
  })

  it('does not let an older finish remove a newer renderer request', () => {
    const registry = new SupersedingRequestRegistry()
    const first = registry.begin(7, 20_000)
    const second = registry.begin(7, 20_000)

    first.finish()
    registry.abort(7)

    expect(second.signal.aborted).toBe(true)
  })

  it('starts the direct-request lifecycle before asynchronous DNS work', () => {
    const source = readFileSync(new URL('../../main/ipc/providers.ts', import.meta.url), 'utf8')
    const handlerStart = source.indexOf("ipcMain.handle('providers:getStream'")
    const handlerEnd = source.indexOf("ipcMain.handle('providers:findBestStream'", handlerStart)
    const handler = source.slice(handlerStart, handlerEnd)

    expect(handler.indexOf('directProviderRequests.begin(')).toBeGreaterThan(-1)
    expect(handler.indexOf('directProviderRequests.begin(')).toBeLessThan(handler.indexOf('await checkDomainResolves('))
    expect(handler).toContain('if (requestLifecycle.signal.aborted)')
  })
})
