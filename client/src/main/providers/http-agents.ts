import http from 'node:http'
import https from 'node:https'
import { lookup, type LookupAddress } from 'node:dns'
import { validateResolvedAddresses } from './network-policy.js'

function guardedLookup(
  hostname: string,
  options: unknown,
  callback: (error: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void,
): void {
  const cb = (typeof options === 'function' ? options : callback) as typeof callback
  const requested = (typeof options === 'object' && options !== null ? options : {}) as { all?: boolean; family?: number }
  lookup(hostname, { ...requested, all: true }, (error, addresses) => {
    if (error) {
      cb(error)
      return
    }
    try {
      validateResolvedAddresses(addresses.map((entry) => entry.address))
    } catch (cause) {
      const blocked = new Error('DNS resolved to a private or reserved address', { cause }) as NodeJS.ErrnoException
      blocked.code = 'EACCES'
      cb(blocked)
      return
    }
    if (requested.all) cb(null, addresses)
    else cb(null, addresses[0]!.address, addresses[0]!.family)
  })
}

export function createAuthenticatedHttpAgents(maxSockets: number): {
  httpAgent: http.Agent
  httpsAgent: https.Agent
} {
  const common = {
    keepAlive: true,
    maxSockets,
    keepAliveMsecs: 30_000,
    lookup: guardedLookup as http.RequestOptions['lookup'],
  }

  return {
    httpAgent: new http.Agent(common),
    httpsAgent: new https.Agent({
      ...common,
      rejectUnauthorized: true,
    }),
  }
}
