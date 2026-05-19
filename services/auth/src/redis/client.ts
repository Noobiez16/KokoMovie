import { Redis } from 'ioredis'
import { config } from '../config.js'

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
})

redis.on('error', (err: Error) => {
  console.error('Redis error:', err.message)
})

// Key builders
export const keys = {
  accessTokenDenylist: (jti: string) => `auth:denylist:access:${jti}`,
  mfaThrottle: (accountId: string) => `auth:mfa:throttle:${accountId}`,
  oauthState: (state: string) => `auth:oauth:state:${state}`,
}
