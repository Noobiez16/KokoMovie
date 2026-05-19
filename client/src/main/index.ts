import { app, BrowserWindow, ipcMain, session, shell, protocol, net } from 'electron'
import { join } from 'path'
import { setupCertPinning } from './cert-pinning'
import { setupUpdater } from './updater'
import { registerAuthIpc } from './ipc/auth'
import { registerDownloadIpc, decryptLocalSegment, purgeExpiredDownloads } from './ipc/download'
import { registerAppIpc } from './ipc/app'
import { registerApiProxy } from './ipc/api-proxy'
import { registerProvidersIpc, initStreamHeaderInjector } from './ipc/providers'

// Register offline:// before app is ready — required for privileged schemes
protocol.registerSchemesAsPrivileged([
  { scheme: 'offline', privileges: { secure: true, supportFetchAPI: true, stream: true, corsEnabled: false } },
])

const isDev = !app.isPackaged || process.env['NODE_ENV'] === 'development'
const RENDERER_URL = 'http://localhost:5173'
const DIST = join(__dirname, '../dist')

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      // E1-S7: Security hardening — non-negotiable per architecture
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: join(__dirname, 'preload.js'),
      spellcheck: false,
      // Disable unnecessary features
      webgl: true,
      plugins: false,
    },
  })

  // Show only when ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' })
  })

  // E1-S5: Certificate pinning
  setupCertPinning(mainWindow)

  // Block navigation to external URLs — open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block navigation away from app origin
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(RENDERER_URL) : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  if (isDev) {
    mainWindow.loadURL(RENDERER_URL)
  } else {
    mainWindow.loadFile(join(DIST, 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── Content Security Policy ──────────────────────────────────────────────────

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://localhost:* ws://localhost:* https:; media-src 'self' blob: https:; img-src 'self' data: blob: https:; frame-src 'self' https://*.youtube.com https://*.youtube-nocookie.com https://*.ytimg.com;"
            : [
                "default-src 'self'",
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline'",
                "media-src 'self' blob: https: http:",
                "connect-src 'self' https://api.kokomovie.com wss://api.kokomovie.com http://localhost:* ws://localhost:* https:",
                "img-src 'self' data: blob: https:",
                "frame-src 'self' https://*.youtube.com https://*.youtube-nocookie.com https://*.ytimg.com https:",
              ].join('; '),
        ],
      },
    })
  })

  // Serve encrypted offline segments via offline://downloadId/seg_N.enc
  protocol.handle('offline', (request) => {
    const url = new URL(request.url)
    const downloadId = url.hostname
    const filename = url.pathname.slice(1) // strip leading /
    const decrypted = decryptLocalSegment(downloadId, filename)
    if (!decrypted) {
      return new Response(null, { status: 404 })
    }
    return new Response(decrypted, {
      status: 200,
      headers: { 'Content-Type': 'video/mp2t', 'Content-Length': String(decrypted.length) },
    })
  })

  purgeExpiredDownloads()
  createWindow()
  setupUpdater()
  registerAuthIpc()
  registerDownloadIpc()
  registerAppIpc()
  registerApiProxy()
  initStreamHeaderInjector()
  registerProvidersIpc()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Prevent second instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, _argv, _cwd) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
