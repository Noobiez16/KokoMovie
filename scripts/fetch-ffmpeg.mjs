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
// The release tag, asset names, and SHA-256 digests below are pinned: a changed upstream
// artifact fails the build instead of silently altering what gets shipped.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const vendorRoot = join(repoRoot, 'client', 'vendor', 'ffmpeg')

export const FFMPEG_RELEASE = 'autobuild-2026-08-03-14-02'
export const FFMPEG_VERSION = 'n8.1.2-34-g9b6c8969e0'
const BASE_URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_RELEASE}`

// Targets KokoMovie actually publishes installers for. macOS stays build-only: BtbN does not
// publish macOS artifacts, so a macOS FFmpeg must be sourced and re-verified before that
// platform leaves build-only status.
//
// The sha256 values are public integrity pins for the upstream release archives, not secrets.
// Secret scanners flag them as generic high-entropy strings; see .gitguardian.yaml. They must
// stay committed — the licence gate and ffmpeg-licensing tests use them to prove the shipped
// binary is the audited LGPL build.
export const FFMPEG_TARGETS = {
  'linux-x64': {
    asset: `ffmpeg-${FFMPEG_VERSION}-linux64-lgpl-8.1.tar.xz`,
    sha256: 'c6794916cf8acef176d55d09f16752ff7abf188f0afe4285f8e45bec40f9aba2',
    binary: 'ffmpeg',
  },
  'linux-arm64': {
    asset: `ffmpeg-${FFMPEG_VERSION}-linuxarm64-lgpl-8.1.tar.xz`,
    sha256: '819b2edc2c65b8d1f4157e00a10e4b7116f06ad989355124c8d4ee34f5b90a1a',
    binary: 'ffmpeg',
  },
  'win32-x64': {
    asset: `ffmpeg-${FFMPEG_VERSION}-win64-lgpl-8.1.zip`,
    sha256: '17593d84c02c3569cfd507541e1c1aecb87d2a8b87ab0ba1d260400c3380efbf',
    binary: 'ffmpeg.exe',
  },
}

// GPL/non-free configure switches that must never appear in a shipped build. FFmpeg embeds its
// full configure line in the executable, so this check reads the binary directly and therefore
// works for cross-architecture targets that cannot be executed on the build host.
const FORBIDDEN_FLAGS = ['--enable-gpl', '--enable-nonfree', '--enable-libx264', '--enable-libx265', '--enable-libxvid']

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

// The configure line is stored as a NUL-terminated ASCII string inside the executable. Scanning
// the raw bytes proves the shipped artifact's licensing rather than trusting the asset filename.
function assertLgplConfiguration(binaryPath, target) {
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
  const spec = FFMPEG_TARGETS[target]
  if (!spec) throw new Error(`Unknown FFmpeg target: ${target}`)

  const destination = join(vendorRoot, target)
  const stampPath = join(destination, 'PROVENANCE.json')
  if (existsSync(stampPath)) {
    const stamp = JSON.parse(readFileSync(stampPath, 'utf8'))
    if (stamp.release === FFMPEG_RELEASE && stamp.sha256 === spec.sha256) {
      console.log(`${target}: already vendored (${FFMPEG_VERSION})`)
      return destination
    }
  }

  const workDir = mkdtempSync(join(tmpdir(), 'kokomovie-ffmpeg-'))
  try {
    console.log(`${target}: downloading ${spec.asset}`)
    const archive = await download(`${BASE_URL}/${spec.asset}`)

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
    if (!FFMPEG_TARGETS[target]) {
      // macOS and other unsupported hosts can still run the app; FFmpeg-dependent features
      // report a clear error instead of failing the whole install.
      console.warn(`No LGPL FFmpeg build is vendored for ${target}; remux and download finalization will be unavailable.`)
      continue
    }
    await fetchTarget(target)
  }
}
