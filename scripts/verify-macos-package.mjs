import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { MACOS_FFMPEG_SOURCE, assertLgplConfiguration } from './fetch-ffmpeg.mjs'

if (process.platform !== 'darwin') throw new Error('macOS package verification requires macOS')
const arch = process.argv[2]
if (!['x64', 'arm64'].includes(arch) || arch !== process.arch) throw new Error('A matching native macOS runner is required')
const app = resolve(`client/release/mac/${arch === 'x64' ? 'mac' : 'mac-arm64'}/KokoMovie.app`)
const resources = join(app, 'Contents/Resources')
const binaryArch = arch === 'x64' ? 'x86_64' : 'arm64'
const ffmpeg = join(resources, 'ffmpeg/ffmpeg')
for (const binary of [join(app, 'Contents/MacOS/KokoMovie'), ffmpeg,
  join(resources, `app.asar.unpacked/node_modules/better-sqlite3/prebuilds/darwin-${arch}.node`),
  join(resources, 'app.asar.unpacked/node_modules/keytar/build/Release/keytar.node')]) {
  if (!existsSync(binary)) throw new Error(`Missing packaged macOS binary: ${binary}`)
  execFileSync('lipo', ['-verify_arch', binaryArch, binary], { stdio: 'inherit' })
}
execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' })
if (!readFileSync(join(resources, 'ffmpeg/LICENSE.txt'), 'utf8').includes('LESSER GENERAL PUBLIC LICENSE')) throw new Error('Missing LGPL license')
const stamp = JSON.parse(readFileSync(join(resources, 'ffmpeg/PROVENANCE.json'), 'utf8'))
if (stamp.sha256 !== MACOS_FFMPEG_SOURCE.sha256 || stamp.target !== `darwin-${arch}`) throw new Error('Incorrect macOS FFmpeg provenance')
assertLgplConfiguration(ffmpeg, `darwin-${arch}`)
const directory = mkdtempSync(join(tmpdir(), 'kokomovie-packaged-ffmpeg-'))
try {
  // Exercise actual native AAC encoding and portable MP4 output from the packaged binary.
  const output = join(directory, 'audio.mp4')
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '0.2', '-c:a', 'aac', '-movflags', '+faststart', output], { stdio: 'inherit' })
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', output, '-f', 'null', '-'], { stdio: 'inherit' })
  // Production fuses deliberately prevent Node-inspector automation. Launch the actual
  // hardened bundle normally and require it to survive startup with its native addons.
  await new Promise((resolveStartup, reject) => {
    const child = spawn(join(app, 'Contents/MacOS/KokoMovie'), [`--user-data-dir=${join(directory, 'profile')}`], {
      env: { ...process.env, KOKOMOVIE_OFFLINE_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let log = ''
    let checked = false
    let forceKill
    const capture = chunk => { log = (log + chunk.toString()).slice(-16000) }
    child.stdout.on('data', capture); child.stderr.on('data', capture)
    const timer = setTimeout(() => {
      checked = true
      child.kill('SIGTERM')
      forceKill = setTimeout(() => child.kill('SIGKILL'), 3000)
    }, 15000)
    child.once('error', error => { clearTimeout(timer); clearTimeout(forceKill); reject(error) })
    child.once('exit', (code, signal) => {
      clearTimeout(timer); clearTimeout(forceKill)
      if (!checked || /Renderer failed to load|NODE_MODULE_VERSION|dlopen.*(?:failed|error)/i.test(log)) {
        reject(new Error(`Packaged app startup failed (${code ?? signal}): ${log}`))
      } else resolveStartup()
    })
  })
} finally { rmSync(directory, { recursive: true, force: true }) }
console.log(`Verified macOS ${arch} package, native modules, ad-hoc signature and FFmpeg execution`)
