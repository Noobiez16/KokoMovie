import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import { z } from 'zod'
import { trustedIpcHandler } from './security.js'
import { buildDiagnosticReport, writeDiagnosticEvent, type DiagnosticReport } from '../diagnostics.js'

const pending = new Map<string, { report: DiagnosticReport; expiresAt: number }>()
const tokenSchema = z.object({ token: z.string().uuid() }).strict()
function parentWindow(): BrowserWindow | undefined { return BrowserWindow.getAllWindows()[0] }

export function registerDiagnosticsIpc(): void {
  ipcMain.handle('diagnostics:preview', trustedIpcHandler(() => {
    const report = buildDiagnosticReport()
    const token = randomUUID()
    pending.set(token, { report, expiresAt: Date.now() + 10 * 60 * 1000 })
    writeDiagnosticEvent('diagnostics', 'report-previewed')
    return { token, report }
  }))
  ipcMain.handle('diagnostics:save', trustedIpcHandler(async (_event, input: unknown) => {
    const { token } = tokenSchema.parse(input)
    const entry = pending.get(token)
    pending.delete(token)
    if (!entry || entry.expiresAt < Date.now()) throw new Error('Diagnostic preview expired. Prepare it again.')
    const options = {
      title: 'Save KokoMovie Diagnostic Report',
      defaultPath: 'KokoMovie-Diagnostics-' + new Date().toISOString().slice(0, 10) + '.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    }
    const result = parentWindow() ? await dialog.showSaveDialog(parentWindow()!, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { cancelled: true }
    writeFileSync(result.filePath, JSON.stringify(entry.report, null, 2) + '\n', 'utf8')
    writeDiagnosticEvent('diagnostics', 'report-saved')
    return { cancelled: false }
  }))
}
