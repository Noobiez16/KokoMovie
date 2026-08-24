import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('torrent capability redaction', () => {
  it('never sends the capability-bearing stream URL to logs', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/main/ipc/torrent.ts'), 'utf8')
    expect(source).not.toContain('→ ${url}`)')
    expect(source).toContain('→ local media stream`')
  })
})
