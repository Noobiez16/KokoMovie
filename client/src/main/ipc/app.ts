import { ipcMain, app } from 'electron'
import { installApplicationMenu } from '../app-menu'
import { normalizeLocale } from '../locales'
import { appLocaleSchema, trustedIpcHandler } from './security'

export function registerAppIpc() {
  ipcMain.handle('app:version', trustedIpcHandler(() => app.getVersion()))
  ipcMain.handle('app:platform', trustedIpcHandler(() => process.platform))
  ipcMain.handle('app:set-locale', trustedIpcHandler((_event, locale: unknown) => {
    return { locale: installApplicationMenu(normalizeLocale(appLocaleSchema.parse(locale))) }
  }))
}
