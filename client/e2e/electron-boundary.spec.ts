import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { isolatedCredentials } from './isolated-credentials'

let application: ElectronApplication
let page: Page
let userDataDirectory: string
let invalidTlsServer: Server
let invalidTlsUrl: string
const cspProbePath = join(process.cwd(), 'dist', 'csp-eval-probe.js')

const execFileAsync = promisify(execFile)

test.beforeAll(async () => {
  // A local external script executes normally; DevTools evaluations can bypass unsafe-eval.
  await writeFile(cspProbePath, `try { new Function('return 42')(); window.cspDynamicCode = 'allowed' } catch { window.cspDynamicCode = 'blocked' }`)
  userDataDirectory = await mkdtemp(join(tmpdir(), 'kokomovie-e2e-'))
  const keyPath = join(userDataDirectory, 'invalid-tls-key.pem')
  const certPath = join(userDataDirectory, 'invalid-tls-cert.pem')
  const openssl = process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : 'openssl'
  await execFileAsync(openssl, [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-keyout', keyPath, '-out', certPath,
  ])
  invalidTlsServer = createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.end('certificate was incorrectly accepted')
  })
  await new Promise<void>((resolve) => invalidTlsServer.listen(0, '127.0.0.1', resolve))
  const tlsAddress = invalidTlsServer.address()
  if (!tlsAddress || typeof tlsAddress === 'string') throw new Error('TLS test server failed to bind')
  invalidTlsUrl = `https://127.0.0.1:${tlsAddress.port}/`
  application = await electron.launch({
    args: await isolatedCredentials(userDataDirectory, null),
    cwd: process.cwd(),
    env: {
      ...process.env,
      KOKOMOVIE_E2E: '1',
      KOKOMOVIE_OFFLINE_TEST: '1',
      NODE_ENV: 'test',
    },
  })
  page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await application?.close()
  await new Promise<void>((resolve) => invalidTlsServer?.close(() => resolve()))
  if (userDataDirectory) await rm(userDataDirectory, { recursive: true, force: true })
  await rm(cspProbePath, { force: true })
})

test('launches the real isolated renderer on Electron 43.4.1', async () => {
  expect(await application.evaluate(({ app }) => app.getVersion())).toBe('2.0.0')
  expect(await application.evaluate(() => process.versions.electron)).toBe('43.4.1')
  const preferences = await application.evaluate(({ BrowserWindow }) => {
    const webContents = BrowserWindow.getAllWindows()[0]?.webContents
    // Electron exposes this runtime diagnostic method without a public declaration.
    if (!webContents || !('getLastWebPreferences' in webContents) || typeof webContents.getLastWebPreferences !== 'function') {
      throw new Error('Electron web preference diagnostics are unavailable')
    }
    const result: unknown = webContents.getLastWebPreferences()
    if (!result || typeof result !== 'object') throw new Error('Invalid Electron web preferences')
    return {
      contextIsolation: 'contextIsolation' in result ? result.contextIsolation : undefined,
      nodeIntegration: 'nodeIntegration' in result ? result.nodeIntegration : undefined,
      sandbox: 'sandbox' in result ? result.sandbox : undefined,
    }
  })
  expect(preferences?.contextIsolation).toBe(true)
  expect(preferences?.nodeIntegration).toBe(false)
  expect(preferences?.sandbox).toBe(true)
  expect(await page.evaluate(() => typeof window.electronAPI)).toBe('object')
  expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
})

test('rejects malformed IPC and persists a valid preference', async () => {
  const malformed = await page.evaluate(async () => {
    if (!window.electronAPI) throw new Error('Desktop preload bridge is required')
    try {
      await window.electronAPI.prefsSet({ autoplay: 'yes' } as never)
      return 'accepted'
    } catch (error) {
      return String(error)
    }
  })
  expect(malformed).toContain('Invalid IPC request')

  await page.evaluate(() => {
    if (!window.electronAPI) throw new Error('Desktop preload bridge is required')
    return window.electronAPI.prefsSet({ autoplay: false })
  })
  expect(await page.evaluate(async () => {
    if (!window.electronAPI) throw new Error('Desktop preload bridge is required')
    return (await window.electronAPI.prefsGet()).autoplay
  })).toBe(0)
})

test('renders desktop guidance in a Chromium window without the preload bridge', async () => {
  const nextWindow = application.waitForEvent('window')
  const windowId = await application.evaluate(async ({ BrowserWindow }) => {
    const primary = BrowserWindow.getAllWindows()[0]!
    const browser = new BrowserWindow({ show: false, width: 1024, height: 768,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
    await browser.loadURL(primary.webContents.getURL())
    return browser.id
  })
  try {
    const browser = await nextWindow
    await expect(browser.getByRole('heading', { name: 'Open KokoMovie in the desktop app' })).toBeVisible()
    expect(await browser.evaluate(() => typeof window.electronAPI)).toBe('undefined')
    await expect(browser.getByText(/npm run dev/)).toBeVisible()
    await expect(browser.locator('.km-topbar')).toHaveCount(0)
    await mkdir(join(process.cwd(), '.codex', 'visual'), { recursive: true })
    await browser.screenshot({ path: join(process.cwd(), '.codex', 'visual', 'runtime-desktop-required.png') })
  } finally {
    await application.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), windowId)
  }
})

test('enforces production script policy while allowing the media worker', async () => {
  const result = await page.evaluate(async () => {
    const probe = window as unknown as { cspInlineProbe?: number }
    probe.cspInlineProbe = 0
    const script = document.createElement('script')
    script.textContent = 'window.cspInlineProbe = 1'
    document.head.append(script)
    script.remove()
    const dynamicCode = await new Promise<string>((resolve) => {
      const external = document.createElement('script')
      external.src = new URL('./csp-eval-probe.js', window.location.href).toString()
      external.onload = () => { external.remove(); resolve((window as unknown as { cspDynamicCode: string }).cspDynamicCode) }
      external.onerror = () => { external.remove(); resolve('load-error') }
      document.head.append(external)
    })
    const workerUrl = URL.createObjectURL(new Blob(['postMessage("worker-ready")'], { type: 'text/javascript' }))
    const workerResult = await new Promise<string>((resolve) => {
      const worker = new Worker(workerUrl)
      const finish = (value: string) => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(workerUrl); resolve(value) }
      const timer = setTimeout(() => finish('timeout'), 3000)
      worker.onmessage = (event) => finish(String(event.data))
      worker.onerror = () => finish('error')
    })
    return { inline: probe.cspInlineProbe, dynamicCode, workerResult }
  })
  expect(result).toEqual({ inline: 0, dynamicCode: 'blocked', workerResult: 'worker-ready' })
})

test('requires the per-session capability on the loopback media service', async () => {
  const result = await page.evaluate(async () => {
    if (!window.electronAPI) throw new Error('Desktop preload bridge is required')
    const { port, capability } = await window.electronAPI.getProxyInfo()
    const withoutCapability = await fetch(`http://localhost:${port}/not-found`)
    const withCapability = await fetch(`http://localhost:${port}/not-found?kmc=${encodeURIComponent(capability)}`)
    return { withoutStatus: withoutCapability.status, withStatus: withCapability.status }
  })
  expect(result.withoutStatus).toBe(403)
  expect(result.withStatus).not.toBe(403)
})

test('rejects privileged IPC from a second untrusted renderer', async () => {
  const preloadPath = join(process.cwd(), 'dist-electron', 'preload.js')
  const result = await application.evaluate(async ({ BrowserWindow }, preload) => {
    const trusted = BrowserWindow.getAllWindows()[0]!
    const untrusted = new BrowserWindow({
      show: false,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    try {
      await untrusted.loadURL(`${trusted.webContents.getURL()}?untrusted-window=1`)
      return await untrusted.webContents.executeJavaScript(`
        (async () => {
          try {
            await window.electronAPI.getAppVersion()
            return 'accepted'
          } catch (error) {
            return String(error)
          }
        })()
      `)
    } finally {
      untrusted.destroy()
    }
  }, preloadPath)
  expect(result).toContain('Untrusted IPC sender')
})

test('rejects a self-signed TLS certificate through the real Electron network stack', async () => {
  const result = await application.evaluate(async ({ BrowserWindow }, url) => {
    const probe = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    try {
      await probe.loadURL(url)
      return 'accepted'
    } catch (error) {
      return String(error)
    } finally {
      probe.destroy()
    }
  }, invalidTlsUrl)
  expect(result).not.toBe('accepted')
  expect(result).toContain('ERR_CERT_AUTHORITY_INVALID')
})
