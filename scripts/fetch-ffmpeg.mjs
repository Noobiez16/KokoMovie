// Vendors the LGPL FFmpeg executables KokoMovie ships.
//
// KokoMovie previously depended on `ffmpeg-static`, whose binary is built with
// --enable-gpl --enable-version3 (GPL-3.0-or-later). FFmpeg is spawned as a separate
// executable, never linked, so an LGPL build satisfies every feature the app uses:
// stream copy, the native AAC encoder, the MP4/MOV muxers, and the Matroska/AVI/MOV/MPEG-TS
// demuxers. None of the GPL-only components (libx264, libx265, libxvid, libvidstab, frei0r)
// are reachable from KokoMovie's FFmpeg invocations.
//
// Builds come from BtbN/FFmpeg-Builds, which publishes explicitly LGPL-configured artifacts.
// The retained monthly release tag, asset names, and SHA-256 digests below are pinned: a changed
// upstream artifact fails the build instead of silently altering what gets shipped. BtbN keeps
// the last build of each month for two years; ordinary daily builds expire after fourteen days.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const vendorRoot = join(repoRoot, 'client', 'vendor', 'ffmpeg')

export const FFMPEG_RELEASE = 'autobuild-2026-07-31-14-10'
export const FFMPEG_VERSION = 'n8.1.2-34-g9b6c8969e0'
const BASE_URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_RELEASE}`

// Linux/Windows use pinned upstream LGPL binaries. macOS builds the unmodified official
// release natively, with external-library autodetection disabled so Homebrew cannot introduce
// GPL components or machine-specific dylib dependencies.
//
// The sha256 values are public integrity pins for the upstream release archives, not secrets.
// Secret scanners flag them as generic high-entropy strings; see .gitguardian.yaml. They must
// stay committed — the licence gate and ffmpeg-licensing tests use them to prove the shipped
// binary is the audited LGPL build.
export const FFMPEG_TARGETS = {
  'linux-x64': {
    asset: `ffmpeg-${FFMPEG_VERSION}-linux64-lgpl-8.1.tar.xz`,
    sha256: '8c8b2897f2a8093ae2d985f7f1867d218451d4c567c1b2437f86a7c73a950b9f',
    binary: 'ffmpeg',
  },
  'linux-arm64': {
    asset: `ffmpeg-${FFMPEG_VERSION}-linuxarm64-lgpl-8.1.tar.xz`,
    sha256: '0c8716a94ac1fe22eb56e7a0cedd0f00c1d8fae712ec19973d679a7a87916743',
    binary: 'ffmpeg',
  },
  'win32-x64': {
    asset: `ffmpeg-${FFMPEG_VERSION}-win64-lgpl-8.1.zip`,
    sha256: '089e4169e93b2b3f3acbfced3c0704d24276a225641bdda04d796d28b07a2a38',
    binary: 'ffmpeg.exe',
  },
}

export const MACOS_FFMPEG_SOURCE = {
  version: '8.1.2',
  release: 'ffmpeg-8.1.2',
  asset: 'ffmpeg-8.1.2.tar.xz',
  url: 'https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz',
  sha256: '464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c',
}
export const MACOS_FFMPEG_TARGETS = ['darwin-x64', 'darwin-arm64']

export function macosConfigureArgs(arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported macOS architecture: ${arch}`)
  return [
    '--prefix=/kokomovie-ffmpeg', '--cc=clang', `--arch=${arch === 'x64' ? 'x86_64' : 'aarch64'}`,
    '--disable-autodetect', '--disable-gpl', '--disable-nonfree', '--enable-version3',
    '--disable-shared', '--enable-static', '--disable-doc', '--disable-debug',
    '--disable-ffplay', '--disable-ffprobe', '--disable-network', '--disable-x86asm',
    '--extra-cflags=-mmacosx-version-min=12.0', '--extra-ldflags=-mmacosx-version-min=12.0',
  ]
}

// GPL/non-free configure switches that must never appear in a shipped build. FFmpeg embeds its
// full configure line in the executable, so this check reads the binary directly and therefore
// works for cross-architecture targets that cannot be executed on the build host.
const FORBIDDEN_FLAGS = ['--enable-gpl', '--enable-nonfree', '--enable-libx264', '--enable-libx265', '--enable-libxvid']

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function downloadArchive(url, { fetcher = fetch, wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms)), attempts = 3, timeoutMs = 120000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let retryable = true
    try {
      const response = await fetcher(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) {
        retryable = [408, 425, 429].includes(response.status) || response.status >= 500
        await response.body?.cancel()
        throw new Error(`Archive download failed with HTTP ${response.status}`)
      }
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      if (!retryable || attempt + 1 === attempts) throw error
      console.warn(`Archive download attempt ${attempt + 1} failed; retrying`)
      await wait(1500 * (attempt + 1))
    }
  }
  throw new Error('Archive download attempts exhausted')
}

export async function fetchMacosSource() {
  const directory = join(vendorRoot, 'source')
  const path = join(directory, MACOS_FFMPEG_SOURCE.asset)
  // CI transfers this exact archive from the Linux quality job, avoiding a second
  // connection to ffmpeg.org from a Mac runner. Local development can fetch it directly.
  const archive = existsSync(path) ? readFileSync(path) : await downloadArchive(MACOS_FFMPEG_SOURCE.url)
  if (sha256(archive) !== MACOS_FFMPEG_SOURCE.sha256) throw new Error('FFmpeg source SHA-256 mismatch')
  mkdirSync(directory, { recursive: true })
  writeFileSync(path, archive)
  return path
}

// The configure line is stored as a NUL-terminated ASCII string inside the executable. Scanning
// the raw bytes proves the shipped artifact's licensing rather than trusting the asset filename.
export function assertLgplConfiguration(binaryPath, target) {
  const contents = readFileSync(binaryPath)
  const marker = contents.indexOf('--prefix=')
  if (marker === -1) throw new Error(`${target}: no FFmpeg configure string found in the binary`)
  const end = contents.indexOf(0, marker)
  const configuration = contents.subarray(marker, end === -1 ? marker + 8192 : end).toString('latin1')

  const violations = FORBIDDEN_FLAGS.filter((flag) => configuration.includes(flag))
  if (violations.length > 0) {
    throw new Error(`${target}: FFmpeg build is not LGPL — found ${violations.join(', ')}`)
  }
  if (!configuration.includes('--enable-version3')) {
    throw new Error(`${target}: expected an --enable-version3 (LGPL-3.0) FFmpeg build`)
  }
  return configuration
}

export async function buildMacosTarget(target) {
  if (!MACOS_FFMPEG_TARGETS.includes(target)) throw new Error(`Unknown FFmpeg target: ${target}`)
  if (process.platform !== 'darwin' || target !== `darwin-${process.arch}`) {
    throw new Error(`${target}: FFmpeg must be built on a matching native macOS runner`)
  }
  const destination = join(vendorRoot, target)
  const configureArgs = macosConfigureArgs(process.arch)
  const stampPath = join(destination, 'PROVENANCE.json')
  if (existsSync(stampPath) && existsSync(join(destination, 'ffmpeg')) && existsSync(join(destination, 'LICENSE.txt')) && existsSync(join(destination, MACOS_FFMPEG_SOURCE.asset))) {
    const stamp = JSON.parse(readFileSync(stampPath, 'utf8'))
    if (stamp.release === MACOS_FFMPEG_SOURCE.release && stamp.sha256 === MACOS_FFMPEG_SOURCE.sha256
      && JSON.stringify(stamp.configureArgs) === JSON.stringify(configureArgs)
      && sha256(readFileSync(join(destination, MACOS_FFMPEG_SOURCE.asset))) === MACOS_FFMPEG_SOURCE.sha256) {
      assertLgplConfiguration(join(destination, 'ffmpeg'), target)
      console.log(`${target}: already built from verified official source`)
      return destination
    }
  }
  const workDir = mkdtempSync(join(tmpdir(), 'kokomovie-ffmpeg-macos-'))
  try {
    const archive = readFileSync(await fetchMacosSource())
    if (sha256(archive) !== MACOS_FFMPEG_SOURCE.sha256) throw new Error(`${target}: FFmpeg source SHA-256 mismatch`)
    const archivePath = join(workDir, MACOS_FFMPEG_SOURCE.asset)
    writeFileSync(archivePath, archive)
    extractArchive(archivePath, workDir)
    const source = join(workDir, MACOS_FFMPEG_SOURCE.release)
    execFileSync('./configure', configureArgs, { cwd: source, stdio: 'inherit' })
    execFileSync('make', [`-j${Math.min(availableParallelism(), 6)}`, 'ffmpeg'], { cwd: source, stdio: 'inherit' })
    const binary = join(source, 'ffmpeg')
    const configuration = assertLgplConfiguration(binary, target)
    // No executable may depend on Homebrew or a temporary build directory.
    const libraries = execFileSync('otool', ['-L', binary], { encoding: 'utf8' }).split('\n').slice(1).map(line => line.trim()).filter(Boolean)
    if (libraries.some(line => !line.startsWith('/usr/lib/') && !line.startsWith('/System/Library/'))) {
      throw new Error(`${target}: FFmpeg has a non-system dynamic dependency: ${libraries.join(', ')}`)
    }
    mkdirSync(destination, { recursive: true })
    moveInto(binary, join(destination, 'ffmpeg'))
    chmodSync(join(destination, 'ffmpeg'), 0o755)
    copyFileSync(join(source, 'COPYING.LGPLv3'), join(destination, 'LICENSE.txt'))
    writeFileSync(join(destination, MACOS_FFMPEG_SOURCE.asset), archive)
    writeFileSync(stampPath, JSON.stringify({ source: MACOS_FFMPEG_SOURCE.url, release: MACOS_FFMPEG_SOURCE.release,
      version: MACOS_FFMPEG_SOURCE.version, sha256: MACOS_FFMPEG_SOURCE.sha256, license: 'LGPL-3.0-or-later',
      target, configureArgs, configuration, vendoredAt: new Date().toISOString() }, null, 2) + '\n')
    return destination
  } finally { rmSync(workDir, { recursive: true, force: true }) }
}

// Zip extraction has to work on both the Linux runners (GNU tar cannot read zip, so `unzip` is
// required) and the Windows runner (where `unzip` may be absent but bsdtar in System32 reads zip).
// Each candidate is tried in turn so neither platform depends on a tool it might not have.
function extractArchive(archivePath, workDir) {
  const candidates = archivePath.endsWith('.zip')
    ? [['unzip', ['-q', archivePath, '-d', workDir]], ['tar', ['-xf', archivePath, '-C', workDir]]]
    : [['tar', ['-xf', archivePath, '-C', workDir]]]

  const failures = []
  for (const [command, args] of candidates) {
    try {
      execFileSync(command, args, { stdio: 'inherit' })
      return
    } catch (error) {
      failures.push(`${command}: ${error.message}`)
    }
  }
  throw new Error(`Could not extract ${archivePath}\n  ${failures.join('\n  ')}`)
}

function extract(archivePath, workDir, target) {
  extractArchive(archivePath, workDir)
  // Every BtbN archive unpacks into a single versioned directory alongside the archive itself.
  const [root] = readdirSync(workDir).filter((entry) => !entry.endsWith('.zip') && !entry.endsWith('.tar.xz'))
  if (!root) throw new Error(`${target}: archive did not unpack into a directory`)
  const binary = join(workDir, root, 'bin', FFMPEG_TARGETS[target].binary)
  const license = join(workDir, root, 'LICENSE.txt')
  if (!existsSync(binary)) throw new Error(`${target}: archive did not contain bin/${FFMPEG_TARGETS[target].binary}`)
  if (!existsSync(license)) throw new Error(`${target}: archive did not contain LICENSE.txt`)
  return { binary, license }
}

// Moves a file out of the temporary work directory. The GitHub Windows runner puts TEMP on C:
// and the workspace on D:, and rename(2) cannot cross devices — it fails with EXDEV. Rename is
// still attempted first because it is the cheap path when both paths share a volume.
function moveInto(source, target) {
  try {
    renameSync(source, target)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    copyFileSync(source, target)
    rmSync(source, { force: true })
  }
}

export async function fetchTarget(target) {
  if (MACOS_FFMPEG_TARGETS.includes(target)) return buildMacosTarget(target)
  const spec = FFMPEG_TARGETS[target]
  if (!spec) throw new Error(`Unknown FFmpeg target: ${target}`)

  const destination = join(vendorRoot, target)
  const stampPath = join(destination, 'PROVENANCE.json')
  if (existsSync(stampPath)) {
    const stamp = JSON.parse(readFileSync(stampPath, 'utf8'))
    if (stamp.release === FFMPEG_RELEASE && stamp.sha256 === spec.sha256 && existsSync(join(destination, spec.binary)) && existsSync(join(destination, 'LICENSE.txt'))) {
      assertLgplConfiguration(join(destination, spec.binary), target)
      console.log(`${target}: already vendored (${FFMPEG_VERSION})`)
      return destination
    }
  }

  const workDir = mkdtempSync(join(tmpdir(), 'kokomovie-ffmpeg-'))
  try {
    console.log(`${target}: downloading ${spec.asset}`)
    const archive = await downloadArchive(`${BASE_URL}/${spec.asset}`)

    const digest = sha256(archive)
    if (digest !== spec.sha256) {
      throw new Error(`${target}: SHA-256 mismatch\n  expected ${spec.sha256}\n  received ${digest}`)
    }

    const archivePath = join(workDir, spec.asset)
    writeFileSync(archivePath, archive)
    const { binary, license } = extract(archivePath, workDir, target)

    const configuration = assertLgplConfiguration(binary, target)

    mkdirSync(destination, { recursive: true })
    moveInto(binary, join(destination, spec.binary))
    chmodSync(join(destination, spec.binary), 0o755)
    moveInto(license, join(destination, 'LICENSE.txt'))
    writeFileSync(stampPath, JSON.stringify({
      source: `${BASE_URL}/${spec.asset}`,
      release: FFMPEG_RELEASE,
      version: FFMPEG_VERSION,
      sha256: spec.sha256,
      license: 'LGPL-3.0-or-later',
      configuration,
      vendoredAt: new Date().toISOString(),
    }, null, 2) + '\n')

    console.log(`${target}: verified LGPL build vendored to client/vendor/ffmpeg/${target}`)
    return destination
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

// Only fetch when invoked as a command. Importing this module (the licensing tests do) must not
// trigger a 100 MB download.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const requested = process.argv.slice(2)
  const targets = requested.length > 0 ? requested : [`${process.platform}-${process.arch}`]

  for (const target of targets) {
    if (target === '--source') { await fetchMacosSource(); continue }
    await fetchTarget(target)
  }
}
