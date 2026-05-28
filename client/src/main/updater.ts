import { autoUpdater } from 'electron-updater'
import { app, ipcMain, BrowserWindow } from 'electron'

export function setupUpdater() {
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

  // Only run in a packaged build — electron-updater has no release metadata to
  // read in dev (and packaged apps don't set NODE_ENV, so the old NODE_ENV
  // check never fired). Check on launch, then every 4 hours.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify()
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000)
  }
}
