import { autoUpdater } from 'electron-updater'
import { app, ipcMain, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// Persist the auto-update preference in userData (same pattern as provider prefs) so the
// choice is respected at startup — before the renderer has loaded — not just in localStorage.
function prefPath(): string {
  return join(app.getPath('userData'), 'update-prefs.json')
}

function loadAutoUpdate(): boolean {
  try {
    if (existsSync(prefPath())) {
      const data = JSON.parse(readFileSync(prefPath(), 'utf8')) as { autoUpdateEnabled?: boolean }
      return data.autoUpdateEnabled !== false // default ON
    }
  } catch { /* fall through to default */ }
  return true
}

function saveAutoUpdate(enabled: boolean): void {
  const path = prefPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ autoUpdateEnabled: enabled }, null, 2), 'utf8')
}

export function setupUpdater() {
  // Only run real updater logic in a packaged build. In development the app is unpackaged
  // and version is often '0.0', which makes electron-updater throw on init.
  if (!app.isPackaged) {
    ipcMain.handle('app:install-update', () => {
      console.log('[updater] app:install-update called in dev mode (stub)')
    })
    // The preference still persists in dev so the toggle reflects/saves the real choice.
    ipcMain.handle('app:get-auto-update', () => loadAutoUpdate())
    ipcMain.handle('app:set-auto-update', (_e, enabled: boolean) => {
      saveAutoUpdate(!!enabled)
      return !!enabled
    })
    ipcMain.handle('app:check-for-updates', () => ({ status: 'dev', version: app.getVersion() }))
    return
  }

  let enabled = loadAutoUpdate()

  autoUpdater.logger = console
  autoUpdater.autoDownload = enabled
  autoUpdater.autoInstallOnAppQuit = enabled

  autoUpdater.on('update-available', (info) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('update:available', info?.version)
  })

  autoUpdater.on('update-downloaded', (info) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('update:downloaded', info?.version)
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message)
  })

  ipcMain.handle('app:install-update', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // Manual, on-demand check so the user doesn't have to wait for the 4-hour cycle. Resolves
  // once the check settles. An explicit check still downloads even when auto-download is off
  // (the user clearly wants the update), so the "ready to install" prompt appears regardless.
  ipcMain.handle('app:check-for-updates', () => new Promise((resolve) => {
    let settled = false
    const finish = (r: { status: string; version?: string; message?: string }) => {
      if (settled) return
      settled = true
      autoUpdater.removeListener('update-available', onAvail)
      autoUpdater.removeListener('update-not-available', onNone)
      autoUpdater.removeListener('error', onErr)
      clearTimeout(timer)
      resolve(r)
    }
    const onAvail = (info: { version?: string }) => {
      if (!autoUpdater.autoDownload) {
        autoUpdater.downloadUpdate().catch((e) => console.error('[updater]', e?.message))
      }
      finish({ status: 'available', version: info?.version })
    }
    const onNone = (info: { version?: string }) => finish({ status: 'not-available', version: info?.version })
    const onErr = (err: Error) => finish({ status: 'error', message: err?.message })
    autoUpdater.once('update-available', onAvail)
    autoUpdater.once('update-not-available', onNone)
    autoUpdater.once('error', onErr)
    const timer = setTimeout(() => finish({ status: 'error', message: 'Timed out checking for updates' }), 60000)
    autoUpdater.checkForUpdates().catch((err) => finish({ status: 'error', message: err?.message }))
  }))

  ipcMain.handle('app:get-auto-update', () => enabled)

  ipcMain.handle('app:set-auto-update', (_e, next: boolean) => {
    enabled = !!next
    saveAutoUpdate(enabled)
    autoUpdater.autoDownload = enabled
    autoUpdater.autoInstallOnAppQuit = enabled
    // Turning it back on should look for an update right away.
    if (enabled) autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[updater]', e?.message))
    return enabled
  })

  // Startup + 4-hourly checks, each gated on the current preference so disabling it
  // genuinely stops auto-download/-install (not just hides the toast).
  if (enabled) autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[updater]', e?.message))
  setInterval(() => {
    if (enabled) autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[updater]', e?.message))
  }, 4 * 60 * 60 * 1000)
}
