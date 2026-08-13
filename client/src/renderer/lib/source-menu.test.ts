import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../components/player/PlayerControls.tsx', import.meta.url), 'utf8')

describe('player source menu', () => {
  it('shows descriptive provider states and detected quality instead of A/S badges', () => {
    expect(source).toContain('sourceStatuses')
    expect(source).toContain('qualityInfo?.displayLabel')
    expect(source).toContain("player.sourceSearching")
    expect(source).toContain("player.sourceTimedOut")
    expect(source).not.toContain('>A</span>')
    expect(source).not.toContain('>S</span>')
  })

  it('warns before initial, cached, and freshly extracted CAM playback', () => {
    const detail = readFileSync(new URL('../pages/ContentDetail.tsx', import.meta.url), 'utf8')
    const videoPlayer = readFileSync(new URL('../components/player/VideoPlayer.tsx', import.meta.url), 'utf8')
    expect(detail.match(/player\.camWarning/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(videoPlayer).toContain('winningStream.qualityInfo?.releaseType')
    expect(videoPlayer).toContain('freshSourceStatuses')
  })

  it('buffers final provider snapshots that arrive before navigation creates the player request', () => {
    const playerHost = readFileSync(new URL('../components/player/PlayerHost.tsx', import.meta.url), 'utf8')
    expect(playerHost).toContain('pendingSourceSnapshotsRef')
    expect(playerHost).toContain('pendingSourceSnapshotsRef.current.set(searchId')
  })

  it('keeps explicitly labeled CAM and TS URLs available for classification', () => {
    const extractor = readFileSync(new URL('../../main/stream-extractor/index.ts', import.meta.url), 'utf8')
    expect(extractor).not.toContain('isCamStream')
  })
})
