import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createMediaListenerScope } from './media-listener-scope'

describe('source-specific media listener scope', () => {
  it('fully removes the previous source callbacks before a rapid source switch', () => {
    const media = new EventTarget()
    const firstSource = vi.fn()
    const secondSource = vi.fn()
    const first = createMediaListenerScope(media)
    first.listen('canplay', firstSource)
    media.dispatchEvent(new Event('canplay'))

    first.clear()
    const second = createMediaListenerScope(media)
    second.listen('canplay', secondSource)
    media.dispatchEvent(new Event('canplay'))

    expect(firstSource).toHaveBeenCalledTimes(1)
    expect(secondSource).toHaveBeenCalledTimes(1)
    second.clear()
    media.dispatchEvent(new Event('canplay'))
    expect(secondSource).toHaveBeenCalledTimes(1)
  })

  it('is used for every source-specific video callback in VideoPlayer', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/player/VideoPlayer.tsx'), 'utf8')
    expect(source).toContain('const sourceListeners = createMediaListenerScope(video)')
    expect(source).toContain('sourceListeners.clear()')
    expect(source).not.toMatch(/video\.addEventListener\('(loadedmetadata|canplay|error)', \(\) =>/)
  })
})
