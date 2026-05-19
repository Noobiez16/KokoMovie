import { ipcMain, app } from 'electron'

export function registerAppIpc() {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)
}
