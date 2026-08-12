import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { normalizeLocale, type AppLocale } from './locales'
import { buildApplicationMenuTemplate } from './app-menu-model'

let currentLocale: AppLocale = 'en-US'

function sendHelpAction(action: 'documentation' | 'feedback'): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  window.webContents.send('help:action', action)
}

export function installApplicationMenu(localeValue: unknown = currentLocale): AppLocale {
  currentLocale = normalizeLocale(localeValue)
  const template = buildApplicationMenuTemplate(currentLocale, process.platform, {
    documentation: () => sendHelpAction('documentation'),
    feedback: () => sendHelpAction('feedback'),
  }) as MenuItemConstructorOptions[]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  return currentLocale
}
