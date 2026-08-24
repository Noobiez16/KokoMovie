function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((part) => part > 255)) return true
  const [a, b, c] = octets
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b! >= 64 && b! <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b! >= 16 && b! <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a! >= 224
}

function ipv6Words(hostname: string): number[] | null {
  let input = hostname.toLowerCase().split('%')[0] ?? ''
  if (input.includes('.')) {
    const separator = input.lastIndexOf(':')
    const ipv4 = input.slice(separator + 1)
    const parts = ipv4.split('.').map(Number)
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
    input = `${input.slice(0, separator)}:${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`
  }
  if ((input.match(/::/g) ?? []).length > 1) return null
  const [leftRaw, rightRaw] = input.split('::')
  const left = leftRaw ? leftRaw.split(':') : []
  const right = rightRaw ? rightRaw.split(':') : []
  const missing = 8 - left.length - right.length
  if ((input.includes('::') && missing < 1) || (!input.includes('::') && missing !== 0)) return null
  const parts = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
  return parts.map((part) => Number.parseInt(part, 16))
}

function isPrivateIpv6(hostname: string): boolean {
  const words = ipv6Words(hostname)
  if (!words) return true
  const [a, b] = words
  if (words.every((word) => word === 0)) return true
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const mapped = `${words[6]! >> 8}.${words[6]! & 0xff}.${words[7]! >> 8}.${words[7]! & 0xff}`
    return isPrivateIpv4(mapped)
  }
  return (a! & 0xfe00) === 0xfc00
    || (a! & 0xffc0) === 0xfe80
    || (a! & 0xffc0) === 0xfec0
    || (a! & 0xff00) === 0xff00
    || (a === 0x2001 && b === 0x0db8)
    || (a === 0x0100 && words.slice(1, 4).every((word) => word === 0))
}

export function isForbiddenProxyHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return true
  if (isPrivateIpv4(hostname)) return true
  if (!hostname.includes(':')) return false
  return isPrivateIpv6(hostname)
}

export function validateProxyTargetUrl(rawUrl: string): URL {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Stream target URL is not permitted')
  }
  if (isForbiddenProxyHostname(url.hostname)) {
    throw new Error('Private network stream targets are not permitted')
  }
  return url
}

export function resolveValidatedRedirect(currentUrl: string, location: string): URL {
  return validateProxyTargetUrl(new URL(location, currentUrl).toString())
}

export function validateResolvedAddresses(addresses: readonly string[]): void {
  if (addresses.length === 0 || addresses.some(isForbiddenProxyHostname)) {
    throw new Error('DNS resolved to a private or reserved address')
  }
}
