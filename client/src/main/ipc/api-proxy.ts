import { ipcMain, net } from 'electron'
import {
  apiProxyRequestSchema,
  trustedIpcHandler,
  validateApiProxyUrl,
} from './security'

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 20_000

export function registerApiProxy(): void {
  ipcMain.handle('api:request', trustedIpcHandler(async (_event, input: unknown) => {
    const opts = apiProxyRequestSchema.parse(input)
    const url = validateApiProxyUrl(opts.url)

    const response = await net.fetch(url.toString(), {
      method: 'GET',
      headers: opts.headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('API response is too large')

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('API response is too large')

    return {
      ok: response.ok,
      status: response.status,
      body: new TextDecoder().decode(bytes),
    }
  }))
}
