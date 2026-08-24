import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('v1.5.5 runtime and package hardening', () => {
  it('keeps release metadata and Electron patch versions consistent', () => {
    const rootPackage = JSON.parse(read('package.json')) as { version: string }
    const clientPackage = JSON.parse(read('client/package.json')) as {
      version: string
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(rootPackage.version).toBe('1.5.5')
    expect(clientPackage.version).toBe('1.5.5')
    expect(clientPackage.devDependencies.electron).toBe('43.4.1')
    expect(clientPackage.scripts['rebuild:native']).toContain('--version 43.4.1')
    for (const target of ['linux', 'win', 'mac']) {
      expect(read(`client/electron-builder.${target}.yml`)).toContain('electronVersion: "43.4.1"')
    }
  })

  it('applies production fuses from every shipping configuration', () => {
    for (const target of ['linux', 'win', 'mac']) {
      expect(read(`client/electron-builder.${target}.yml`)).toContain('afterPack: build/after-pack.cjs')
    }
    const hook = read('client/build/after-pack.cjs')
    expect(hook).toContain('[FuseV1Options.RunAsNode]: false')
    expect(hook).toContain('[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false')
    expect(hook).toContain('[FuseV1Options.EnableNodeCliInspectArguments]: false')
  })

  it('runs the fuse and real Electron boundary gates in release CI', () => {
    const workflow = read('.github/workflows/electron-release.yml')
    const job = (name: string, nextName: string) => {
      const start = workflow.indexOf(`  ${name}:`)
      const end = workflow.indexOf(`  ${nextName}:`)
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeGreaterThan(start)
      return workflow.slice(start, end)
    }
    const qualityJob = job('quality', 'electron-e2e')
    const electronJob = job('electron-e2e', 'build-linux')
    const linuxJob = job('build-linux', 'package-linux-arm64')
    const windowsJob = job('build-windows', 'create-release')
    expect(workflow).toContain('npm run verify:fuses --workspace=client')
    expect(qualityJob).toContain('runs-on: ubuntu-24.04')
    expect(electronJob).toContain('runs-on: ubuntu-22.04')
    expect(electronJob).toContain('npm run build --workspace=client')
    expect(electronJob).toContain('xvfb-run -a npm run test:e2e --workspace=client')
    expect(electronJob).toContain('DEBUG: pw:browser')
    expect(linuxJob).toContain('runner: ubuntu-24.04')
    expect(linuxJob).toContain('runner: ubuntu-24.04-arm')
    expect(linuxJob).toContain('needs: [quality, electron-e2e]')
    expect(windowsJob).toContain('needs: [quality, electron-e2e]')
    expect(workflow).not.toContain('--no-sandbox')
  })

  it('never overrides Chromium certificate failures', () => {
    const policy = read('client/src/main/cert-pinning.ts')
    expect(policy).toContain('callback(false)')
    expect(policy).not.toContain('callback(true)')
    expect(policy).not.toContain('event.preventDefault()')
  })

  it('guards the offline protocol before preflight or file access', () => {
    const main = read('client/src/main/index.ts')
    const auth = main.indexOf('isAuthorizedLocalMediaRequest({ url: request.url')
    const options = main.indexOf("request.method === 'OPTIONS'")
    expect(auth).toBeGreaterThan(0)
    expect(auth).toBeLessThan(options)
  })
})
