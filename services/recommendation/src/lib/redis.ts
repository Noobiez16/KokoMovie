import { Redis } from 'ioredis'
import { config } from '../config.js'

let _client: Redis | null = null

export function getRedis(): Redis {
  if (!_client) {
    _client = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 })
    _client.on('error', (err: Error) => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNREFUSED') {
        console.error('[redis] error', err.message)
      }
    })
  }
  return _client
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const v = await getRedis().get(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch { /* non-fatal */ }
}
