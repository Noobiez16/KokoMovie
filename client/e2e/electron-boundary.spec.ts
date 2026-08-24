import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

let application: ElectronApplication
let page: Page
let userDataDirectory: string
let invalidTlsServer: Server
let invalidTlsUrl: string

const execFileAsync = promisify(execFile)

test.beforeAll(async () => {
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
    args: ['.', `--user-data-dir=${userDataDirectory}`],
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
})

test('launches the real isolated renderer on Electron 43.4.1', async () => {
  expect(await application.evaluate(({ app }) => app.getVersion())).toBe('1.5.5')
  expect(await application.evaluate(() => process.versions.electron)).toBe('43.4.1')
  const preferences = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences(),
  )
  expect(preferences?.contextIsolation).toBe(true)
  expect(preferences?.nodeIntegration).toBe(false)
  expect(preferences?.sandbox).toBe(true)
  expect(await page.evaluate(() => typeof window.electronAPI)).toBe('object')
  expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
})

test('rejects malformed IPC and persists a valid preference', async () => {
  const malformed = await page.evaluate(async () => {
    try {
      await window.electronAPI.prefsSet({ autoplay: 'yes' } as never)
      return 'accepted'
    } catch (error) {
      return String(error)
    }
  })
  expect(malformed).toContain('Invalid IPC request')

  await page.evaluate(() => window.electronAPI.prefsSet({ autoplay: false }))
  expect(await page.evaluate(async () => (await window.electronAPI.prefsGet()).autoplay)).toBe(0)
})

test('requires the per-session capability on the loopback media service', async () => {
  const result = await page.evaluate(async () => {
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
