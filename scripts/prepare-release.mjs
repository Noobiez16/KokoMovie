import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { MACOS_FFMPEG_SOURCE } from './fetch-ffmpeg.mjs'
import { verifyReleaseVersion } from './verify-release-version.mjs'

export function mergeMacUpdateInfo(entries, version) {
  if (entries.length !== 2 || new Set(entries.map(([arch]) => arch)).size !== 2 || !entries.every(([arch]) => ['x64', 'arm64'].includes(arch))) {
    throw new Error('Both macOS architectures are required')
  }
  const files = []
  for (const [arch, metadata] of entries) {
    if (metadata.version !== version || !Array.isArray(metadata.files)) throw new Error(`Invalid ${arch} macOS update metadata`)
    const expected = new Set(['dmg', 'zip'].map(ext => `KokoMovie-${version}-mac-${arch}.${ext}`))
    for (const file of metadata.files) {
      if (!expected.delete(file.url) || typeof file.sha512 !== 'string') throw new Error(`Unexpected macOS update asset: ${file.url}`)
      files.push(file)
    }
    if (expected.size) throw new Error(`Missing ${arch} macOS update entries: ${[...expected]}`)
  }
  if (files.length !== 4) throw new Error('Both macOS architectures are required')
  files.sort((a, b) => Number(!a.url.endsWith('.zip')) - Number(!b.url.endsWith('.zip')) || a.url.localeCompare(b.url))
  return { version, files, path: files[0].url, sha512: files[0].sha512, releaseDate: entries[0][1].releaseDate }
}

export async function digestFile(path, algorithm = 'sha512', encoding = 'base64') {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest(encoding)
}

export async function verifyUpdateFiles(metadata, directory, version, expectedFile) {
  if (metadata.version !== version || !Array.isArray(metadata.files) || !metadata.files.length) throw new Error('Invalid update version or file list')
  if (expectedFile && (metadata.path !== expectedFile || !metadata.files.some(file => file.url === expectedFile))) {
    throw new Error('Update metadata targets the wrong installer or architecture')
  }
  for (const file of metadata.files) {
    if (typeof file.url !== 'string' || basename(file.url) !== file.url || !file.url.includes(version)) throw new Error('Unsafe or unversioned update filename')
    if (await digestFile(join(directory, file.url)) !== file.sha512) throw new Error(`Update checksum mismatch: ${file.url}`)
  }
}

export function releaseNotes(changelog, version) {
  const heading = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\].*$`, 'm')
  const match = heading.exec(changelog)
  if (!match) throw new Error(`Missing release notes for ${version}`)
  return changelog.slice(match.index).split(/\n## \[/)[0].trim() + '\n'
}

export async function prepareRelease(root, input, output) {
  const version = verifyReleaseVersion(root, process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined)
  await mkdir(output, { recursive: true })
  const required = [
    ['windows', `KokoMovie-Setup-${version}.exe`], ['windows', `KokoMovie-Setup-${version}.exe.blockmap`], ['windows', 'latest.yml'],
    ['linux', `KokoMovie-${version}-linux-x86_64.AppImage`], ['linux', `KokoMovie-${version}-linux-amd64.deb`],
    ['linux', `KokoMovie-${version}-linux-arm64.AppImage`], ['linux', `KokoMovie-${version}-linux-arm64.deb`],
    ['linux', 'latest-linux.yml'], ['linux', 'latest-linux-arm64.yml'],
  ]
  for (const arch of ['x64', 'arm64']) {
    for (const ext of ['dmg', 'zip']) required.push([`macos/macos-release-${arch}`, `KokoMovie-${version}-mac-${arch}.${ext}`])
  }
  for (const [directory, file] of required) await copyFile(join(input, directory, file), join(output, file))
  // Preserve optional differential block maps. The signed installer/ZIP hashes are checked below.
  for (const directory of ['linux', 'windows', 'macos/macos-release-x64', 'macos/macos-release-arm64']) {
    for (const file of await readdir(join(input, directory))) {
      if (file.endsWith('.blockmap')) await copyFile(join(input, directory, file), join(output, file))
    }
  }
  for (const [file, expected] of [['latest.yml', `KokoMovie-Setup-${version}.exe`],
    ['latest-linux.yml', `KokoMovie-${version}-linux-x86_64.AppImage`],
    ['latest-linux-arm64.yml', `KokoMovie-${version}-linux-arm64.AppImage`]]) {
    await verifyUpdateFiles(yaml.load(await readFile(join(output, file), 'utf8')), output, version, expected)
  }
  const entries = []
  for (const arch of ['x64', 'arm64']) {
    const directory = join(input, 'macos', `macos-release-${arch}`)
    const metadata = yaml.load(await readFile(join(directory, 'latest-mac.yml'), 'utf8'))
    await verifyUpdateFiles(metadata, directory, version)
    entries.push([arch, metadata])
  }
  await writeFile(join(output, 'latest-mac.yml'), yaml.dump(mergeMacUpdateInfo(entries, version)))
  const source = join(input, 'macos/macos-release-arm64', MACOS_FFMPEG_SOURCE.asset)
  if (await digestFile(source, 'sha256', 'hex') !== MACOS_FFMPEG_SOURCE.sha256) throw new Error('macOS FFmpeg source checksum mismatch')
  await copyFile(source, join(output, MACOS_FFMPEG_SOURCE.asset))
  for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) await copyFile(join(root, file), join(output, file))
  await writeFile(join(output, 'RELEASE_NOTES.md'), releaseNotes(await readFile(join(root, 'docs/changelog.md'), 'utf8'), version))
  const sums = []
  for (const file of (await readdir(output)).sort()) {
    if (file !== 'SHA256SUMS.txt') sums.push(`${await digestFile(join(output, file), 'sha256', 'hex')}  ${file}`)
  }
  await writeFile(join(output, 'SHA256SUMS.txt'), sums.join('\n') + '\n')
  console.log(`Verified release v${version}: Windows, Linux x64/arm64, macOS x64/arm64, update hashes, source and notices`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareRelease(process.cwd(), resolve(process.argv[2] ?? 'artifacts'), resolve(process.argv[3] ?? 'release-artifacts'))
}
