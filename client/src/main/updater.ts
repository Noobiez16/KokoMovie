import { autoUpdater } from 'electron-updater'
import { ipcMain, BrowserWindow } from 'electron'

export function setupUpdater() {
  autoUpdater.logger = console
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', () => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('update:available')
  })

  autoUpdater.on('update-downloaded', () => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('update:downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message)
  })

  ipcMain.handle('app:install-update', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // Check for updates every 4 hours
  if (process.env['NODE_ENV'] === 'production') {
    autoUpdater.checkForUpdatesAndNotify()
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000)
  }
}
