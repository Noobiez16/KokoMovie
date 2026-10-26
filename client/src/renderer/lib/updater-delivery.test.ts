import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const boundary = vi.hoisted(() => ({ packaged: true, handlers: new Map<string, (...args: any[]) => any>(), open: vi.fn(), check: vi.fn(), download: vi.fn() }))
vi.mock('electron', () => ({ app: { get isPackaged() { return boundary.packaged }, getVersion: () => '2.1.0' },
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => boundary.handlers.set(name, handler) },
  shell: { openExternal: boundary.open }, BrowserWindow: {} }))
vi.mock('electron-updater', () => ({ autoUpdater: { checkForUpdates: boundary.check, downloadUpdate: boundary.download } }))
import { setupUpdater } from '../../main/updater'
import { setTrustedRendererWebContentsId } from '../../main/ipc/security'
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
const frame = { url: 'file:///app/index.html' }
const event = { sender: { id: 7, mainFrame: frame, getURL: () => frame.url }, senderFrame: frame }
beforeEach(() => { boundary.handlers.clear(); boundary.packaged = true; vi.clearAllMocks(); Object.defineProperty(process, 'platform', { value: 'darwin' }); setTrustedRendererWebContentsId(7, frame.url) })
afterEach(() => { Object.defineProperty(process, 'platform', platform); setTrustedRendererWebContentsId(null) })
describe('ad-hoc macOS update delivery', () => {
  it('uses manual updates without initializing Squirrel or downloading a replacement', async () => {
    setupUpdater()
    expect(boundary.handlers.get('app:update-mode')!(event)).toBe('manual')
    expect(boundary.handlers.get('app:get-auto-update')!(event)).toBe(false)
    expect(boundary.handlers.get('app:check-for-updates')!(event)).toEqual({ status: 'manual', version: '2.1.0' })
    expect(boundary.handlers.get('app:set-auto-update')!(event, true)).toBe(false)
    expect(() => boundary.handlers.get('app:set-auto-update')!(event, 'yes')).toThrow('Invalid IPC request')
    expect(boundary.check).not.toHaveBeenCalled()
    expect(boundary.download).not.toHaveBeenCalled()
    expect(boundary.open).not.toHaveBeenCalled()
    await boundary.handlers.get('app:install-update')!(event)
    expect(boundary.open).toHaveBeenCalledWith('https://github.com/Noobiez16/KokoMovie/releases/latest')
  })
  it('retains development behavior and rejects an untrusted caller', () => {
    boundary.packaged = false
    setupUpdater()
    expect(boundary.handlers.get('app:update-mode')!(event)).toBe('development')
    expect(boundary.handlers.get('app:check-for-updates')!(event)).toEqual({ status: 'dev', version: '2.1.0' })
    setTrustedRendererWebContentsId(null)
    expect(() => boundary.handlers.get('app:update-mode')!(event)).toThrow('Untrusted IPC sender')
  })
})
