import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FFMPEG_RELEASE, FFMPEG_TARGETS, FFMPEG_VERSION } from '../../../../scripts/fetch-ffmpeg.mjs'

// KokoMovie distributes an FFmpeg executable. The former `ffmpeg-static` dependency shipped a
// GPL-3.0-or-later build, which dictated the project's own distribution licence and blocked the
// release. These checks keep the shipped binary LGPL and pinned.

const clientPackage = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
const fetchScript = readFileSync(resolve(process.cwd(), '../scripts/fetch-ffmpeg.mjs'), 'utf8')

describe('FFmpeg licensing policy', () => {
  it('does not depend on the GPL ffmpeg-static package', () => {
    const declared = { ...clientPackage.dependencies, ...clientPackage.devDependencies }
    expect(declared['ffmpeg-static']).toBeUndefined()
    // @ffmpeg-installer/ffmpeg advertises LGPL-2.1 in its manifest but ships a binary configured
    // with --enable-gpl --enable-libx264; it is not an acceptable substitute.
    expect(declared['@ffmpeg-installer/ffmpeg']).toBeUndefined()
  })

  it('pins every shipped target to a verified digest', () => {
    expect(Object.keys(FFMPEG_TARGETS).sort()).toEqual(['linux-arm64', 'linux-x64', 'win32-x64'])
    for (const [target, spec] of Object.entries(FFMPEG_TARGETS)) {
      expect(spec.sha256, target).toMatch(/^[0-9a-f]{64}$/)
      expect(spec.asset, target).toContain('lgpl')
      expect(spec.asset, target).toContain(FFMPEG_VERSION)
      // The GPL-only variants published alongside these assets must never be selected.
      expect(spec.asset, target).not.toMatch(/-gpl/)
    }
  })

  it('pins an immutable upstream release rather than a floating tag', () => {
    expect(FFMPEG_RELEASE).not.toBe('latest')
    expect(FFMPEG_RELEASE).toMatch(/^autobuild-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/)
  })

  it('rejects GPL and non-free builds by inspecting the binary configure string', () => {
    for (const flag of ['--enable-gpl', '--enable-nonfree', '--enable-libx264', '--enable-libx265', '--enable-libxvid']) {
      expect(fetchScript).toContain(flag)
    }
    // The verification must read the binary itself, not trust the asset filename.
    expect(fetchScript).toContain('assertLgplConfiguration')
    expect(fetchScript).toContain('no FFmpeg configure string found in the binary')
  })

  it('packages FFmpeg outside the asar archive so users can inspect and replace it', () => {
    for (const config of ['electron-builder.linux.yml', 'electron-builder.win.yml']) {
      const contents = readFileSync(resolve(process.cwd(), config), 'utf8')
      expect(contents, config).toContain('to: ffmpeg')
      expect(contents, config).toContain('LICENSE.txt')
      // LGPL relinking freedom depends on the executable staying outside app.asar.
      expect(contents, config).not.toContain('ffmpeg-static')
    }
  })
})
