import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { digestFile, mergeMacUpdateInfo, releaseNotes, verifyUpdateFiles, type UpdateMetadata } from '../../../../scripts/prepare-release.mjs'
import { verifyReleaseVersion } from '../../../../scripts/verify-release-version.mjs'

const version = '2.1.0'
const metadata = (arch: string): UpdateMetadata => ({ version, files: ['zip', 'dmg'].map(ext => ({ url: `KokoMovie-${version}-mac-${arch}.${ext}`, sha512: `fixture-${arch}-${ext}` })) })
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('release artifact integrity', () => {
  it('combines both architecture manifests without dropping an installer or ZIP', () => {
    const combined = mergeMacUpdateInfo([['x64', metadata('x64')], ['arm64', metadata('arm64')]], version)
    expect(combined.files.map(file => file.url)).toEqual(['arm64.zip', 'x64.zip', 'arm64.dmg', 'x64.dmg'].map(suffix => `KokoMovie-${version}-mac-${suffix}`))
    expect(combined.path).toMatch(/\.zip$/)
    expect(combined.sha512).toBe(combined.files[0]!.sha512)
  })
  it('rejects missing architecture, missing ZIP, wrong version and unexpected paths', () => {
    expect(() => mergeMacUpdateInfo([['x64', metadata('x64')]], version)).toThrow('Both macOS architectures')
    const missing = metadata('x64'); missing.files.shift()
    expect(() => mergeMacUpdateInfo([['x64', missing], ['arm64', metadata('arm64')]], version)).toThrow('Missing x64')
    expect(() => mergeMacUpdateInfo([['x64', { ...metadata('x64'), version: '2.0.0' }], ['arm64', metadata('arm64')]], version)).toThrow('Invalid x64')
    const unsafe = metadata('x64'); unsafe.files[0]!.url = '../outside.zip'
    expect(() => mergeMacUpdateInfo([['x64', unsafe], ['arm64', metadata('arm64')]], version)).toThrow('Unexpected macOS update asset')
    expect(() => mergeMacUpdateInfo([['x64', metadata('x64')], ['x64', metadata('x64')]], version)).toThrow('Both macOS architectures')
  })
  it('verifies actual bytes and rejects a tampered release before publication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kokomovie-release-')); directories.push(directory)
    const name = `KokoMovie-${version}-mac-arm64.zip`
    await writeFile(join(directory, name), 'original archive bytes')
    const info = { version, files: [{ url: name, sha512: await digestFile(join(directory, name)) }] }
    await expect(verifyUpdateFiles(info, directory, version)).resolves.toBeUndefined()
    await expect(verifyUpdateFiles({ ...info, path: name }, directory, version, name)).resolves.toBeUndefined()
    await expect(verifyUpdateFiles({ ...info, path: name }, directory, version, name.replace('arm64', 'x64'))).rejects.toThrow('wrong installer or architecture')
    await writeFile(join(directory, name), 'changed archive bytes')
    await expect(verifyUpdateFiles(info, directory, version)).rejects.toThrow('checksum mismatch')
    await expect(verifyUpdateFiles({ version, files: [{ ...info.files[0]!, url: `../${name}` }] }, directory, version)).rejects.toThrow('Unsafe')
    await expect(verifyUpdateFiles({ ...info, version: '0.0.0' }, directory, version)).rejects.toThrow('Invalid update version')
  })
  it('extracts only the requested release notes and enforces matching tag and package versions', async () => {
    expect(releaseNotes('intro\n## [2.1.0] — today\n- New macOS builds\n\n## [2.0.0]\n- Old\n', version)).toBe('## [2.1.0] — today\n- New macOS builds\n')
    expect(() => releaseNotes('## [2.0.0]\nold', version)).toThrow('Missing release notes')
    const root = resolve(process.cwd(), '..')
    expect(verifyReleaseVersion(root, `v${version}`)).toBe(version)
    expect(() => verifyReleaseVersion(root, 'v2.0.1')).toThrow('does not match')
    expect(await readFile(join(root, 'docs/changelog.md'), 'utf8')).toContain(`## [${version}]`)
  })
})
