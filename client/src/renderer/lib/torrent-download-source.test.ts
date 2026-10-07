import { describe, expect, it } from 'vitest'
import { bindTorrentDownloadSource, isTrustedTorrentDownloadSource } from '../../main/providers/torrent-download-source'
import { withLocalMediaCapability } from '../../main/providers/local-media-capability'
import { urlWithFixtureCredentials } from './security-test-fixtures'

const credentialedTorrentUrl = new URL(urlWithFixtureCredentials('localhost', '/t/movie-file-0-es.mp4'))
credentialedTorrentUrl.protocol = 'http:'
credentialedTorrentUrl.port = '43210'
describe('main registered torrent download contract', () => {
  const live = new Set(['movie-file-0-es', 'episode-file-8-fr'])
  it.each(['movie-file-0-es', 'episode-file-8-fr'])('accepts exact live selected file and language %s', (token) => {
    bindTorrentDownloadSource(43210, (candidate) => live.has(candidate))
    const url = withLocalMediaCapability(`http://localhost:43210/t/${token}.mp4?language=${token.endsWith('es') ? 'es' : 'fr'}`)
    expect(isTrustedTorrentDownloadSource(url)).toBe(true)
    expect(new URL(url).searchParams.get('language')).toBe(token.endsWith('es') ? 'es' : 'fr')
  })
  it.each([
    'http://localhost:43211/t/movie-file-0-es.mp4',
    'http://[::1]:43210/t/movie-file-0-es.mp4',
    'http://localhost:43210/t/unknown.mp4',
    'http://localhost:43210/arbitrary/movie-file-0-es.mp4',
    'https://localhost:43210/t/movie-file-0-es.mp4',
    credentialedTorrentUrl.toString(),
    'http://192.168.1.1:43210/t/movie-file-0-es.mp4',
  ])('rejects untrusted URL %s', (url) => {
    expect(isTrustedTorrentDownloadSource(withLocalMediaCapability(url))).toBe(false)
  })
  it('rejects missing, wrong capabilities and expired file registrations', () => {
    const url = 'http://localhost:43210/t/movie-file-0-es.mp4'
    expect(isTrustedTorrentDownloadSource(url)).toBe(false)
    expect(isTrustedTorrentDownloadSource(`${url}?kmc=wrong`)).toBe(false)
    live.delete('movie-file-0-es')
    expect(isTrustedTorrentDownloadSource(withLocalMediaCapability(url))).toBe(false)
  })
})

import { isLiveTorrentFile } from '../../main/providers/torrent-download-source'
it('rejects destroyed torrents and files even while their token remains registered', () => {
  const file = { destroyed: false }
  const torrent = { destroyed: false, files: [file] }
  expect(isLiveTorrentFile(torrent, file)).toBe(true)
  torrent.destroyed = true
  expect(isLiveTorrentFile(torrent, file)).toBe(false)
  torrent.destroyed = false; file.destroyed = true
  expect(isLiveTorrentFile(torrent, file)).toBe(false)
  file.destroyed = false; torrent.files = []
  expect(isLiveTorrentFile(torrent, file)).toBe(false)
})
