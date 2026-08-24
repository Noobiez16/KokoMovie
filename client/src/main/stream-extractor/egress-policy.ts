import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { isForbiddenProxyHostname, validateResolvedAddresses } from '../providers/network-policy.js'

const DNS_TIMEOUT_MS = 3_000

export function validateExtractorRequestTarget(rawUrl: string, resolvedAddresses: readonly string[]): URL {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Provider extraction target is not permitted')
  }
  if (isForbiddenProxyHostname(url.hostname)) {
    throw new Error('Provider extraction cannot access private or reserved networks')
  }
  if (resolvedAddresses.length > 0) validateResolvedAddresses(resolvedAddresses)
  return url
}

async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  const normalized = hostname.replace(/^\[|\]$/g, '')
  if (isIP(normalized)) return [normalized]
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      lookup(normalized, { all: true, verbatim: true }).then((answers) => answers.map((answer) => answer.address)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Provider DNS lookup timed out')), DNS_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function isExtractorRequestAllowed(rawUrl: string): Promise<boolean> {
  try {
    const url = validateExtractorRequestTarget(rawUrl, [])
    const addresses = await resolvePublicAddresses(url.hostname)
    validateExtractorRequestTarget(rawUrl, addresses)
    return true
  } catch {
    return false
  }
}
