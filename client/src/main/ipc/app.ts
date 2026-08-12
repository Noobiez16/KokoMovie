import { ipcMain, app } from 'electron'
import { installApplicationMenu } from '../app-menu'
import { normalizeLocale } from '../locales'
import { assertTrustedRenderer } from './security'

export function registerAppIpc() {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)
  ipcMain.handle('app:set-locale', (event, locale: unknown) => {
    assertTrustedRenderer(event)
    return { locale: installApplicationMenu(normalizeLocale(locale)) }
  })
}
