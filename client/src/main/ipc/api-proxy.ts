import { ipcMain, net } from 'electron'

export function registerApiProxy() {
  ipcMain.handle('api:request', async (_event, opts: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }) => {
    const response = await net.fetch(opts.url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body,
    })
    const body = await response.text()
    return { ok: response.ok, status: response.status, body }
  })
}
