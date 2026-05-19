import { createHash, randomBytes } from 'crypto'

// Global salt loaded once — generated if not set
const IP_HASH_SALT = process.env['IP_HASH_SALT'] ?? randomBytes(16).toString('hex')

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip + IP_HASH_SALT).digest('hex')
}

export function getClientIp(request: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? request.ip
  return request.ip
}
