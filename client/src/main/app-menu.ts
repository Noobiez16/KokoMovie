import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'

function sendHelpAction(action: 'documentation' | 'feedback'): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  window.webContents.send('help:action', action)
}

export function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ label: app.name, submenu: [{ role: 'about' as const }, { type: 'separator' as const }, { role: 'quit' as const }] }]
      : []),
    { label: 'File', submenu: [{ role: process.platform === 'darwin' ? 'close' : 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        ...(process.env['NODE_ENV'] === 'development' ? [{ role: 'toggleDevTools' as const }] : []),
        { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(process.platform === 'darwin' ? [{ role: 'front' as const }] : [{ role: 'close' as const }])] },
    {
      role: 'help',
      submenu: [
        { label: 'Documentation', accelerator: 'F1', click: () => sendHelpAction('documentation') },
        { label: 'Send Feedback…', click: () => sendHelpAction('feedback') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
