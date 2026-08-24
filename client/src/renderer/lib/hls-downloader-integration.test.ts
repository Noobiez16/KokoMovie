import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('HLS downloader integration', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/main/ipc/download.ts'), 'utf8')

  it('uses the typed plan and materializes every referenced object through the shared fetcher', () => {
    expect(source).toContain('createHlsDownloadPlan(')
    expect(source).toContain('materializeHlsObject(')
    expect(source).toContain("Range: `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}`")
    expect(source).not.toContain('interface HlsManifest')
    expect(source).not.toContain("if (trimmed && !trimmed.startsWith('#'))")
  })

  it('preflights HLS playlists before inserting a queue row', () => {
    const preflight = source.indexOf('await buildDownloadPlan(opts.manifestUrl')
    const insert = source.indexOf('INSERT INTO downloads')
    expect(preflight).toBeGreaterThan(0)
    expect(insert).toBeGreaterThan(preflight)
    expect(source).toContain("throw new PublicIpcError(error.code)")
  })

  it('drops preflight plans when a queued download is cancelled or deleted', () => {
    expect(source.match(/pendingHlsPlans\.delete\(id\)/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('lets FFmpeg auto-detect TS or fMP4 and maps an alternate audio input when present', () => {
    expect(source).not.toContain("'-f', 'mpegts', '-i', 'pipe:0'")
    expect(source).toContain("'-map', '1:a:0?'")
    expect(source).toContain("plan.audio ? ['-i', audioInputPath] : []")
  })

  it('routes HTTP artwork and subtitles through the guarded downloader transport', () => {
    expect(source).toContain('{}, MAX_DOWNLOAD_ARTWORK_BYTES))')
    expect(source).toContain('{}, 2 * 1024 * 1024))')
    expect(source).toContain('if (maxBytes && received > maxBytes)')
    expect(source).toContain("maxBytes ? 'identity' : 'gzip, deflate'")
    expect(source).toContain('{ maxOutputLength: maxBytes }')
    expect(source).toContain('if (err instanceof ResponseTooLargeError) throw err')
    expect(source.match(/validateDownloadSourceUrl\(/g)?.length).toBeGreaterThanOrEqual(4)
    expect(source).toContain("new URL(sourceUrl).protocol === 'catalog-cache:'")
  })
})
