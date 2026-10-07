import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test } from '@playwright/test'
import { isolatedCredentials } from './isolated-credentials'

for (const height of [720, 1080]) {
  test(`actual ${height}p playback preserves decoded pixels and media session in fullscreen`, async () => {
    const directory = await mkdtemp(resolve('.codex/tmp/fullscreen-media-'))
    const visual = resolve('.codex/visual')
    await mkdir(visual, { recursive: true })
    const fixture = join(directory, 'source.mp4')
    const width = height === 720 ? 1280 : 1920
    const ffmpeg = resolve('vendor/ffmpeg', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    await promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=purple:s=${width}x${height}:r=24`, '-t', '20', '-c:v', 'libopenh264', '-b:v', '500k', '-movflags', '+faststart', fixture], { windowsHide: true })
    const bytes = await readFile(fixture)
    const source = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': bytes.length })
      response.end(bytes)
    })
    await new Promise<void>(done => source.listen(0, '127.0.0.1', done))
    const address = source.address()
    if (!address || typeof address === 'string') throw new Error('Fixture bind failed')
    const application = await electron.launch({ args: await isolatedCredentials(directory, 'fixture-key'), cwd: process.cwd(), env: { ...process.env, KOKOMOVIE_E2E: '1', KOKOMOVIE_OFFLINE_TEST: '1', NODE_ENV: 'test' } })
    try {
      const page = await application.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      const url = await application.evaluate(({ app, ipcMain, session }, port) => {
        const path = process.getBuiltinModule('node:path')
        const { createRequire } = process.getBuiltinModule('node:module')
        const load = createRequire(path.join(app.getAppPath(), 'package.json'))
        const { bindTorrentDownloadSource } = load(path.join(app.getAppPath(), 'dist-electron/providers/torrent-download-source.js'))
        const { withLocalMediaCapability } = load(path.join(app.getAppPath(), 'dist-electron/providers/local-media-capability.js'))
        bindTorrentDownloadSource(port, (token: string) => token === 'fullscreen-file')
        ipcMain.removeHandler('tmdb:request')
        ipcMain.handle('tmdb:request', () => ({ body: JSON.stringify({ id: 100, title: 'Fullscreen Fixture', overview: '', genres: [], credits: { cast: [] }, release_dates: { results: [] }, external_ids: { imdb_id: null }, videos: { results: [] }, results: [] }), source: 'network', stale: false }))
        session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_details, callback) => callback({ cancel: true }))
        return withLocalMediaCapability(`http://localhost:${port}/t/fullscreen-file.mp4`)
      }, address.port)
      const contentId = '00000001-0000-4000-8000-000000000064'
      const download = await page.evaluate(({ url, directory, contentId }) => window.electronAPI.downloadContent({ contentId, title: 'Fullscreen Fixture', contentType: 'movie', manifestUrl: url, customDownloadPath: directory }), { url, directory, contentId })
      await expect.poll(() => page.evaluate(() => window.electronAPI.listDownloads()), { timeout: 15000 }).toEqual(expect.arrayContaining([expect.objectContaining({ id: download.id, status: 'completed' })]))
      await new Promise<void>(done => source.close(() => done()))
      await page.goto(page.url().split('#')[0] + `#/player/${contentId}?offline=${download.id}`)
      const video = page.locator('video')
      await expect(video).toHaveCount(1)
      await expect.poll(() => video.evaluate(element => ({ width: element.videoWidth, height: element.videoHeight }))).toEqual({ width, height })
      await video.evaluate(element => {
        element.pause()
        element.currentTime = 2
        Object.assign(window, { fullscreenFixtureVideo: element, fullscreenFixtureSrc: element.currentSrc, fullscreenFixtureReloads: 0 })
        for (const event of ['loadstart', 'emptied']) element.addEventListener(event, () => { (window as unknown as { fullscreenFixtureReloads: number }).fullscreenFixtureReloads++ })
      })
      await page.mouse.move(300, 300)
      await page.getByRole('button', { name: 'Playback settings', exact: true }).click()
      await page.getByRole('button', { name: new RegExp(`^Quality.*${height}p`) }).click()
      await expect(page.getByRole('button', { name: new RegExp(`^${height}p`) })).toBeVisible()
      await expect(page.getByRole('button', { name: new RegExp(`^${height === 720 ? 1080 : 720}p`) })).toBeDisabled()
      await page.mouse.click(200, 200)
      await expect(page.getByRole('button', { name: new RegExp(`^${height}p`) })).toHaveCount(0)
      await video.evaluate(element => { element.muted = true; return element.play() })
      await page.getByTitle('Fullscreen', { exact: true }).click()
      await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
      const metrics = await video.evaluate(element => {
        const fixture = window as unknown as { fullscreenFixtureVideo: HTMLVideoElement; fullscreenFixtureSrc: string; fullscreenFixtureReloads: number }
        return { sameVideo: element === fixture.fullscreenFixtureVideo, sameSource: element.currentSrc === fixture.fullscreenFixtureSrc, reloads: fixture.fullscreenFixtureReloads, width: element.videoWidth, height: element.videoHeight, position: element.currentTime, fit: getComputedStyle(element).objectFit }
      })
      expect(metrics).toMatchObject({ sameVideo: true, sameSource: true, reloads: 0, width, height, fit: 'contain' })
      await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(metrics.position)
      await page.evaluate(() => document.exitFullscreen())
      await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
      await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setFullScreen(true))
      await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen())).toBe(true)
      await expect.poll(() => video.evaluate(element => ({ width: element.videoWidth, height: element.videoHeight }))).toEqual({ width, height })
      expect(await video.evaluate(element => element === (window as unknown as { fullscreenFixtureVideo: HTMLVideoElement }).fullscreenFixtureVideo)).toBe(true)
      expect(await page.evaluate(() => (window as unknown as { fullscreenFixtureReloads: number }).fullscreenFixtureReloads)).toBe(0)
      await page.mouse.move(300, 300)
      await page.getByRole('button', { name: 'Playback settings', exact: true }).click()
      await page.getByRole('button', { name: new RegExp(`^Quality.*${height}p`) }).click()
      await expect(page.getByRole('button', { name: new RegExp(`^${height}p`) })).toBeVisible()
      await expect(page.getByRole('button', { name: new RegExp(`^${height === 720 ? 1080 : 720}p`) })).toBeDisabled()
      await page.screenshot({ path: join(visual, `fullscreen-video-${height}.png`), animations: 'disabled' })
      await writeFile(join(visual, `fullscreen-video-${height}.json`), JSON.stringify(metrics, null, 2))
    } finally {
      await application.close()
      if (source.listening) await new Promise<void>(done => source.close(() => done()))
      if (!resolve(directory).startsWith(resolve('.codex/tmp') + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Fixture cleanup escaped test workspace')
      await rm(directory, { recursive: true, force: true })
    }
  })
}
