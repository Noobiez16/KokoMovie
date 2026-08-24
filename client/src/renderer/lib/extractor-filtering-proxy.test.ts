import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePinnedAddress } from '../../main/stream-extractor/filtering-proxy'

describe('extractor filtering proxy', () => {
  it('pins a public answer selected from a fully public DNS set', async () => {
    await expect(resolvePinnedAddress('media.example', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ])).resolves.toBe('93.184.216.34')
  })

  it('rejects the entire answer set when DNS mixes public and private addresses', async () => {
    await expect(resolvePinnedAddress('rebind.example', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])).rejects.toThrow('private or reserved')
  })

  it('routes the extractor partition through the pinned proxy before loading', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/main/stream-extractor/index.ts'), 'utf8')
    expect(source).toContain('providerSession.setProxy')
    expect(source.indexOf('providerSession.setProxy')).toBeLessThan(source.indexOf('win.loadURL(embedUrl'))
  })

  it('destroys a partially-started response instead of writing a second header block', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/main/stream-extractor/filtering-proxy.ts'), 'utf8')
    expect(source).toContain('if (response.headersSent)')
    expect(source).toContain('response.destroy()')
    expect(source).toContain("upstreamResponse.once('error', () => response.destroy())")
    expect(source).toContain("response.once('close', () => upstream.destroy())")
  })
})
