function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((part) => part > 255)) return true
  const [a, b] = octets
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b! >= 64 && b! <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b! >= 16 && b! <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a! >= 224
}

export function isForbiddenProxyHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return true
  if (isPrivateIpv4(hostname)) return true
  if (!hostname.includes(':')) return false
  if (hostname === '::' || hostname === '::1') return true
  if (/^f[cd]/.test(hostname) || /^fe[89ab]/.test(hostname)) return true
  const mapped = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIpv4(mapped[1]!) : false
}

export function validateProxyTargetUrl(rawUrl: string): URL {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Stream target URL is not permitted')
  }
  if (isForbiddenProxyHostname(url.hostname)) {
    throw new Error('Private network stream targets are not permitted')
  }
  return url
}
