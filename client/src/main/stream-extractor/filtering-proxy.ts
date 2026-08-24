import { lookup } from 'node:dns/promises'
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect, isIP } from 'node:net'
import type { Duplex } from 'node:stream'
import { validateExtractorRequestTarget } from './egress-policy.js'
import { validateResolvedAddresses } from '../providers/network-policy.js'

type Resolver = (hostname: string) => Promise<readonly { address: string; family: number }[]>

const defaultResolver: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true })

export async function resolvePinnedAddress(hostname: string, resolver: Resolver = defaultResolver): Promise<string> {
  const normalized = hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(normalized)
    ? [normalized]
    : (await resolver(normalized)).map((answer) => answer.address)
  validateResolvedAddresses(addresses)
  return addresses[0]!
}

function rejectHttp(response: ServerResponse, statusCode = 403): void {
  if (response.destroyed) return
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.writeHead(statusCode, { Connection: 'close', 'Content-Length': '0' })
  response.end()
}

function rejectTunnel(socket: Duplex): void {
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
}

function parseAuthority(authority: string): { hostname: string; port: number } {
  const parsed = new URL(`http://${authority}`)
  const port = Number(parsed.port || 443)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid proxy authority')
  return { hostname: parsed.hostname, port }
}

async function forwardHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!request.url) return rejectHttp(response, 400)
  const target = validateExtractorRequestTarget(request.url, [])
  if (target.protocol !== 'http:') return rejectHttp(response, 400)
  const pinnedAddress = await resolvePinnedAddress(target.hostname)
  const headers: Record<string, string | string[] | undefined> = { ...request.headers, host: target.host, connection: 'close' }
  delete headers['proxy-authorization']
  delete headers['proxy-connection']

  const upstream = httpRequest({
    host: pinnedAddress,
    family: isIP(pinnedAddress),
    port: Number(target.port || 80),
    method: request.method,
    path: `${target.pathname}${target.search}`,
    headers,
    agent: false,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.once('error', () => response.destroy())
    response.once('close', () => upstreamResponse.destroy())
    upstreamResponse.pipe(response)
  })
  upstream.on('error', () => rejectHttp(response, 502))
  response.once('close', () => upstream.destroy())
  request.pipe(upstream)
}

async function openTunnel(authority: string, clientSocket: Duplex, head: Buffer): Promise<void> {
  const { hostname, port } = parseAuthority(authority)
  validateExtractorRequestTarget(`https://${hostname}:${port}/`, [])
  const pinnedAddress = await resolvePinnedAddress(hostname)
  const upstream = connect({ host: pinnedAddress, family: isIP(pinnedAddress), port })
  upstream.once('connect', () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length > 0) upstream.write(head)
    upstream.pipe(clientSocket)
    clientSocket.pipe(upstream)
  })
  upstream.once('error', () => rejectTunnel(clientSocket))
  clientSocket.once('error', () => upstream.destroy())
}

export async function startFilteringProxy(): Promise<string> {
  const server = createServer((request, response) => {
    void forwardHttp(request, response).catch(() => rejectHttp(response))
  })
  server.on('connect', (request, socket, head) => {
    void openTunnel(request.url ?? '', socket, head).catch(() => rejectTunnel(socket))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Extractor filtering proxy did not bind')
  return `http://127.0.0.1:${address.port}`
}
