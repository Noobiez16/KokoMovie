import { autoUpdater } from 'electron-updater'
import { app, ipcMain, BrowserWindow } from 'electron'

export function setupUpdater() {
  // Only run updater logic in a packaged build.
  // In development, the app is unpackaged and version is often '0.0',
  // which causes electron-updater to crash on initialization.
  if (!app.isPackaged) {
    ipcMain.handle('app:install-update', () => {
      console.log('[updater] app:install-update called in dev mode (stub)')
    })
    return
  }

  autoUpdater.logger = console
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

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

  autoUpdater.checkForUpdatesAndNotify()
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000)
}

