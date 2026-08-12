import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { _electron: electron } = require('@playwright/test')
const electronPath = require('electron')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const client = join(root, 'client')
const smokeMain = join(root, 'scripts', 'stream-smoke-main.cjs')
const viteBin = resolve(dirname(require.resolve('vite')), '../../bin/vite.js')
const profile = mkdtempSync(join(tmpdir(), 'kokomovie-interface-smoke-'))

const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--strictPort'], {
  cwd: client,
  env: { ...process.env },
  stdio: ['ignore', 'ignore', 'ignore'],
  windowsHide: true,
})

async function waitForRenderer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`Renderer server exited with code ${vite.exitCode}`)
    try {
      const response = await fetch('http://127.0.0.1:5173')
      if (response.ok && (await response.text()).includes('<div id="root"></div>')) return
    } catch { /* Vite is still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error('Renderer server did not become ready')
}

async function launch() {
  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: ['--disable-gpu', '--disable-gpu-compositing', '--use-gl=disabled', smokeMain],
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', KOKOMOVIE_SMOKE_PROFILE: profile, KOKOMOVIE_SMOKE_DISABLE_GPU: '1' },
  })
  const page = await electronApp.firstWindow()
  await page.waitForFunction(() => Boolean(window.electronAPI?.prefsGet), undefined, { timeout: 30_000 })
  return { electronApp, page }
}

async function menuSnapshot(electronApp) {
  return electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    return {
      labels: menu?.items.map((item) => item.label) ?? [],
      hasDevTools: Boolean(menu?.items.some((item) => item.submenu?.items.some((child) => child.role === 'toggleDevTools'))),
    }
  })
}

async function switchLanguage(page, nativeLabel, expectedHeading, expectedLocale) {
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: nativeLabel }).click()
  await page.getByRole('heading', { name: expectedHeading }).waitFor()
  await page.waitForFunction((locale) => document.documentElement.lang === locale, expectedLocale)
}

let first
let second
try {
  await waitForRenderer()
  first = await launch()
  await first.page.evaluate(() => { window.location.hash = '#/settings' })
  await first.page.getByRole('heading', { name: 'Settings' }).waitFor()

  const englishMenu = await menuSnapshot(first.electronApp)
  if (!englishMenu.hasDevTools || !englishMenu.labels.includes('View')) throw new Error('English View menu or Developer Tools entry is missing')

  await switchLanguage(first.page, 'Español', 'Configuración', 'es-ES')
  const spanishMenu = await menuSnapshot(first.electronApp)
  if (!spanishMenu.labels.includes('Ver')) throw new Error('Native menu did not switch to Spanish')

  await switchLanguage(first.page, 'Français', 'Paramètres', 'fr-FR')
  const frenchMenu = await menuSnapshot(first.electronApp)
  if (!frenchMenu.labels.includes('Affichage')) throw new Error('Native menu did not switch to French')
  await first.page.getByText('Films', { exact: true }).first().waitFor()

  await first.electronApp.close()
  first = null

  second = await launch()
  await second.page.waitForFunction(() => document.documentElement.lang === 'fr-FR')
  const persisted = await second.page.evaluate(async () => window.electronAPI.prefsGet())
  const relaunchedMenu = await menuSnapshot(second.electronApp)
  if (persisted.language !== 'fr-FR' || !relaunchedMenu.labels.includes('Affichage')) {
    throw new Error('French locale did not survive relaunch')
  }

  console.log(JSON.stringify({
    status: 'passed',
    locales: ['en-US', 'es-ES', 'fr-FR'],
    developerToolsEntry: true,
    persistedLocale: persisted.language,
    isolatedProfile: true,
  }))
} finally {
  await first?.electronApp.close().catch(() => {})
  await second?.electronApp.close().catch(() => {})
  vite.kill()
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* Chromium may release cache handles a moment later. */ }
}
