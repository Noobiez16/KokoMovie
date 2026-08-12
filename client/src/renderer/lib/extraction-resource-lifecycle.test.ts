import { describe, expect, it, vi } from 'vitest'
import { teardownExtractionResources } from '../../main/stream-extractor/resource-lifecycle'

describe('extraction resource teardown', () => {
  it('observes a synchronous closed event emitted during destruction', async () => {
    let onClosed: (() => void) | undefined
    const window = {
      isDestroyed: () => false,
      destroy: vi.fn(() => onClosed?.()),
      once: vi.fn((_event: 'closed', listener: () => void) => { onClosed = listener }),
    }
    const activeWindows = { delete: vi.fn() }
    const providerSession = { clearStorageData: vi.fn(async () => {}) }

    await teardownExtractionResources(window, activeWindows, providerSession)

    expect(activeWindows.delete).toHaveBeenCalledWith(window)
  })

  it('retains accounting until a window that resisted destruction is actually closed', async () => {
    let destroyed = false
    let onClosed: (() => void) | undefined
    const window = {
      isDestroyed: () => destroyed,
      destroy: vi.fn(() => { throw new Error('Chromium teardown failure') }),
      once: vi.fn((_event: 'closed', listener: () => void) => { onClosed = listener }),
    }
    const activeWindows = { delete: vi.fn() }
    const providerSession = { clearStorageData: vi.fn(async () => {}) }

    const teardown = teardownExtractionResources(window, activeWindows, providerSession)
    await Promise.resolve()

    expect(window.destroy).toHaveBeenCalledOnce()
    expect(activeWindows.delete).not.toHaveBeenCalled()
    expect(providerSession.clearStorageData).not.toHaveBeenCalled()

    destroyed = true
    onClosed?.()
    await teardown

    expect(activeWindows.delete).toHaveBeenCalledWith(window)
    expect(providerSession.clearStorageData).toHaveBeenCalledOnce()
  })
})
