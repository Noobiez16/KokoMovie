import { describe, expect, it } from 'vitest'
import { createAuthenticatedHttpAgents } from '../../main/providers/http-agents'

describe('authenticated outbound agents', () => {
  it('keeps connections alive without disabling certificate verification', () => {
    const { httpAgent, httpsAgent } = createAuthenticatedHttpAgents(12)
    const httpOptions = (httpAgent as unknown as {
      options: { keepAlive?: boolean; lookup?: unknown }
    }).options
    const httpsOptions = (httpsAgent as unknown as {
      options: { keepAlive?: boolean; maxSockets?: number; rejectUnauthorized?: boolean }
    }).options

    expect(httpOptions.keepAlive).toBe(true)
    expect(typeof httpOptions.lookup).toBe('function')
    expect(httpsOptions.keepAlive).toBe(true)
    expect(httpsOptions.maxSockets).toBe(12)
    expect(httpsOptions.rejectUnauthorized).toBe(true)

    httpAgent.destroy()
    httpsAgent.destroy()
  })
})
