import { isAuthorizedLocalMediaRequest } from './local-media-capability.js'
let serverPort = 0
let hasLiveToken: (token: string) => boolean = () => false
// Bound only by the main-process torrent server after its actual listening port is known.
export function bindTorrentDownloadSource(port: number, hasToken: (token: string) => boolean): void {
  serverPort = port
  hasLiveToken = hasToken
}
export function isTrustedTorrentDownloadSource(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const match = /^\/t\/([A-Za-z0-9_-]+)\.(?:mp4|stream)$/.exec(url.pathname)
    return serverPort > 0 && url.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(url.hostname.toLowerCase())
      && Number(url.port) === serverPort && !url.username && !url.password
      && !!match && hasLiveToken(match[1]!)
      && isAuthorizedLocalMediaRequest({ url: rawUrl, headers: {} })
  } catch { return false }
}

export function isLiveTorrentFile(torrent: { destroyed?: boolean; files?: unknown[] }, file: { destroyed?: boolean }): boolean {
  return !torrent.destroyed && !file.destroyed && !!torrent.files?.includes(file)
}
