import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FFMPEG_RELEASE, FFMPEG_TARGETS, FFMPEG_VERSION, MACOS_FFMPEG_SOURCE, MACOS_FFMPEG_TARGETS, macosConfigureArgs, buildMacosTarget, downloadArchive } from '../../../../scripts/fetch-ffmpeg.mjs'

// KokoMovie distributes an FFmpeg executable. The former `ffmpeg-static` dependency shipped a
// GPL-3.0-or-later build, which dictated the project's own distribution licence and blocked the
// release. These checks keep the shipped binary LGPL and pinned.

const clientPackage = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
const fetchScript = readFileSync(resolve(process.cwd(), '../scripts/fetch-ffmpeg.mjs'), 'utf8')

describe('FFmpeg licensing policy', () => {
  it('retries transient archive connections and server failures with a finite backoff', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('connect timeout'))
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('verified bytes'))
    const wait = vi.fn().mockResolvedValue(undefined)
    expect((await downloadArchive('https://fixture.invalid/archive', { fetcher, wait })).toString()).toBe('verified bytes')
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls).toEqual([[1500], [3000]])
    expect(fetcher.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  })

  it('fails permanent archive errors immediately and exhausts only the bounded transient budget', async () => {
    const wait = vi.fn().mockResolvedValue(undefined)
    const missing = vi.fn().mockResolvedValue(new Response('missing', { status: 404 }))
    await expect(downloadArchive('https://fixture.invalid/missing', { fetcher: missing, wait })).rejects.toThrow('HTTP 404')
    expect(missing).toHaveBeenCalledOnce()
    expect(wait).not.toHaveBeenCalled()
    const offline = vi.fn().mockRejectedValue(new TypeError('offline'))
    await expect(downloadArchive('https://fixture.invalid/offline', { fetcher: offline, wait })).rejects.toThrow('offline')
    expect(offline).toHaveBeenCalledTimes(3)
  })
  it('pins both native macOS targets to official source without external-library autodetection', () => {
    expect(MACOS_FFMPEG_TARGETS).toEqual(['darwin-x64', 'darwin-arm64'])
    expect(MACOS_FFMPEG_SOURCE.url).toBe(`https://ffmpeg.org/releases/ffmpeg-${MACOS_FFMPEG_SOURCE.version}.tar.xz`)
    expect(MACOS_FFMPEG_SOURCE.sha256).toMatch(/^[a-f0-9]{64}$/)
    for (const arch of ['x64', 'arm64']) {
      const args = macosConfigureArgs(arch)
      expect(args).toEqual(expect.arrayContaining(['--disable-autodetect', '--disable-gpl', '--disable-nonfree', '--enable-version3', '--disable-shared', '--enable-static']))
      expect(args).toContain(`--arch=${arch === 'x64' ? 'x86_64' : 'aarch64'}`)
      expect(args).not.toContain('--enable-gpl')
    }
    expect(() => macosConfigureArgs('universal')).toThrow('Unsupported macOS architecture')
  })

  it('rejects a foreign macOS build host rather than silently shipping another architecture', async () => {
    if (process.platform !== 'darwin') await expect(buildMacosTarget('darwin-arm64')).rejects.toThrow('matching native macOS runner')
    await expect(buildMacosTarget('darwin-universal')).rejects.toThrow('Unknown FFmpeg target')
  })
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

  it('pins a retained monthly autobuild rather than an expiring daily build', () => {
    // BtbN retains the final successful autobuild of each month. Keep this curated rather than
    // inferring retention from the calendar date: an ordinary build on the 28th can still expire.
    const verifiedRetainedReleases = ['autobuild-2026-07-31-14-10']
    expect(verifiedRetainedReleases).toContain(FFMPEG_RELEASE)
  })

  it('keeps distribution and legal documentation aligned with the pinned build', () => {
    for (const document of ['docs/current-state.md', 'docs/LEGAL.md', 'THIRD-PARTY-NOTICES.md']) {
      expect(readFileSync(resolve(process.cwd(), '..', document), 'utf8'), document)
        .toContain(FFMPEG_RELEASE)
    }
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
    for (const config of ['electron-builder.linux.yml', 'electron-builder.win.yml', 'electron-builder.mac.yml']) {
      const contents = readFileSync(resolve(process.cwd(), config), 'utf8')
      expect(contents, config).toContain('to: ffmpeg')
      expect(contents, config).toContain('LICENSE.txt')
      // LGPL relinking freedom depends on the executable staying outside app.asar.
      expect(contents, config).not.toContain('ffmpeg-static')
    }
  })
})
