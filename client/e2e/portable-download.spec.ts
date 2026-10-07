import { mkdtemp, rm, readFile, readdir, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test } from '@playwright/test'
import { isolatedCredentials } from './isolated-credentials'

test('downloads an equal-title movie and episode through real FFmpeg and plays offline', async () => {
  await mkdir(resolve('.codex/tmp'), { recursive: true })
  const directory = await mkdtemp(resolve('.codex/tmp/portable-'))
  const fixture = join(directory, 'source.mp4')
  const ffmpeg = resolve('vendor/ffmpeg', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  await promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libopenh264', '-b:v', '100k', '-c:a', 'aac', '-movflags', '+faststart', fixture], { windowsHide: true })
  const bytes = await readFile(fixture)
  const source = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': bytes.length })
    response.end(bytes)
  })
  await new Promise<void>(done => source.listen(0, '127.0.0.1', done))
  const address = source.address()
  if (!address || typeof address === 'string') throw new Error('Fixture bind failed')
  const application = await electron.launch({ args: await isolatedCredentials(directory, null), cwd: process.cwd(), env: { ...process.env, KOKOMOVIE_E2E: '1', KOKOMOVIE_OFFLINE_TEST: '1', NODE_ENV: 'test' } })
  try {
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    // A process-owned selected-file fixture exercises the real downloader contract, without peers.
    const url = await application.evaluate(({ app }, port) => {
      const path = process.getBuiltinModule('node:path')
      const { createRequire } = process.getBuiltinModule('node:module')
      const load = createRequire(path.join(app.getAppPath(), 'package.json'))
      const { bindTorrentDownloadSource } = load(path.join(app.getAppPath(), 'dist-electron/providers/torrent-download-source.js'))
      const { withLocalMediaCapability } = load(path.join(app.getAppPath(), 'dist-electron/providers/local-media-capability.js'))
      bindTorrentDownloadSource(port, (token: string) => token === 'selected-file')
      return withLocalMediaCapability(`http://localhost:${port}/t/selected-file.mp4`)
    }, address.port)
    const started = await page.evaluate(async ({ url, directory }) => {
      const api = window.electronAPI
      if (!api) throw new Error('Desktop preload bridge is required')
      return Promise.all([1, 2].map(index => api.downloadContent({
        contentId: 'portable-fixture-' + index, title: 'Equal Title', contentType: index === 1 ? 'movie' : 'series', episodeId: index === 2 ? 'ep-11-1-2' : undefined, manifestUrl: url, customDownloadPath: directory,
      })))
    }, { url, directory })
    await expect.poll(() => page.evaluate(() => {
      if (!window.electronAPI) throw new Error('Desktop preload bridge is required')
      return window.electronAPI.listDownloads()
    }), { timeout: 15000 }).toEqual(expect.arrayContaining(started.map(({ id }) => expect.objectContaining({ id, status: 'completed', progress_percent: 100 }))))
    const rows = await page.evaluate(async () => {
      if (!window.electronAPI) throw new Error('Desktop preload bridge is required')
      return (await window.electronAPI.listDownloads()).map(row => {
        if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string'
          || !('manifest_path' in row) || typeof row.manifest_path !== 'string'
          || !('episode_id' in row) || (row.episode_id !== null && typeof row.episode_id !== 'string')) {
          throw new Error('Invalid completed download row')
        }
        return { id: row.id, manifest_path: row.manifest_path, episode_id: row.episode_id }
      })
    })
    const paths = rows.map(row => row.manifest_path)
    expect(new Set(paths).size).toBe(2)
    for (const path of paths) {
      expect((await readFile(path)).subarray(4, 8).toString()).toBe('ftyp')
      expect(JSON.parse(await readFile(path + '.kokomovie.json', 'utf8')).mediaFile).toMatch(/\.mp4$/)
    }
    expect(rows.find(row => row.id === started[1]!.id)?.episode_id).toBe('ep-11-1-2')
    for (const { id } of started) expect(await readdir(directory)).not.toContain(id)
    await new Promise<void>(done => source.close(() => done()))
    // Removing the origin and blocking HTTP proves the saved movie supplies the video bytes.
    await application.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_details, callback) => callback({ cancel: true })))
    const result = await page.evaluate(async id => {
      if (!window.electronAPI) throw new Error('Desktop preload bridge is required')
      const manifest = await window.electronAPI.getOfflineManifest(id)
      const url = manifest!.manifestContent.slice('direct:'.length)
      const range = await fetch(url, { headers: { Range: 'bytes=0-63' } })
      const length = (await range.arrayBuffer()).byteLength
      const video = document.createElement('video')
      video.muted = true
      document.body.append(video)
      try {
        const loaded = new Promise<void>((done, reject) => { video.onloadedmetadata = () => done(); video.onerror = () => reject(new Error('Offline video failed to decode')) })
        video.src = url
        await loaded
        const sought = new Promise<void>(done => { video.onseeked = () => done() })
        video.currentTime = 1.5
        await sought
        await video.play()
        return { status: range.status, length, duration: video.duration, position: video.currentTime, playing: !video.paused }
      } finally { video.pause(); video.removeAttribute('src'); video.load(); video.remove() }
    }, started[0]!.id)
    expect(result).toMatchObject({ status: 206, length: 64, playing: true })
    expect(result.duration).toBeGreaterThan(2.5)
    expect(result.position).toBeGreaterThanOrEqual(1.5)
    await page.evaluate(async ids => {
      if (!window.electronAPI) throw new Error('Desktop preload bridge is required')
      for (const id of ids) await window.electronAPI.deleteDownload(id)
    }, started.map(item => item.id))
    for (const path of paths) expect(await readdir(directory)).not.toContain(path.split(/[\\/]/).at(-1))
  } finally {
    await application.close()
    if (source.listening) await new Promise<void>(done => source.close(() => done()))
    await rm(directory, { recursive: true, force: true })
  }
})
