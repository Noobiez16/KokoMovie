import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test } from '@playwright/test'
import { isolatedCredentials } from './isolated-credentials'

test('real HLS switches promptly, bounds a stalled provider, retries, and decodes 4K', async () => {
  test.setTimeout(100_000)
  await mkdir(resolve('.codex/tmp'), { recursive: true })
  const directory = await mkdtemp(resolve('.codex/tmp/provider-media-'))
  const visual = resolve('.codex/visual')
  await mkdir(visual, { recursive: true })
  const ffmpeg = resolve('vendor/ffmpeg', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  for (const [height, width] of [[720, 1280], [1080, 1920], [2160, 3840]]) {
    await promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=purple:s=${width}x${height}:r=24`, '-t', '30', '-c:v', 'libopenh264', '-b:v', '500k', '-g', '24', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '0', join(directory, `${height}.m3u8`)], { windowsHide: true })
  }
  await writeFile(join(directory, 'master.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\n1080.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=3840x2160\n2160.m3u8\n')
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith('/hang/')) return // An upstream socket that never sends headers.
    const filename = request.url?.split('?')[0]?.slice(1) ?? ''
    if (!/^(?:master|720|1080|2160)\.m3u8$|^(?:720|1080|2160)\d+\.ts$/.test(filename)) { response.writeHead(404); response.end(); return }
    try {
      const bytes = await readFile(join(directory, filename))
      response.writeHead(200, { 'Content-Type': filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', 'Access-Control-Allow-Origin': '*' })
      response.end(bytes)
    } catch { response.writeHead(404); response.end() }
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture bind failed')
  const base = `http://127.0.0.1:${address.port}`
  const application = await electron.launch({ args: await isolatedCredentials(directory, 'fixture-key'), cwd: process.cwd(), env: { ...process.env, KOKOMOVIE_E2E: '1', KOKOMOVIE_OFFLINE_TEST: '1', NODE_ENV: 'test' } })
  try {
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await application.evaluate(({ ipcMain, session }, base) => {
      const fixture = globalThis as unknown as { providerFixtureCalls: string[] }
      fixture.providerFixtureCalls = []
      for (const channel of ['tmdb:request', 'providers:list', 'providers:getStream', 'torrent:get-streams']) ipcMain.removeHandler(channel)
      ipcMain.handle('tmdb:request', () => ({ body: JSON.stringify({ id: 100, title: 'Provider Fixture', runtime: 1, overview: '', genres: [], credits: { cast: [] }, release_dates: { results: [] }, external_ids: { imdb_id: null }, videos: { results: [] }, results: [] }), source: 'network', stale: false }))
      ipcMain.handle('providers:list', () => ['A', 'B', 'C', 'D'].map(id => ({ id, name: `Fixture ${id}`, enabled: true })))
      ipcMain.handle('providers:getStream', (_event, id: string) => {
        fixture.providerFixtureCalls.push(id)
        return { providerId: id, providerName: `Fixture ${id}`, streams: id === 'D' ? [] : [{ url: `${base}/master.m3u8` }] }
      })
      ipcMain.handle('torrent:get-streams', () => [])
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (details, callback) => callback({ cancel: !details.url.startsWith(base + '/') }))
    }, base)
    await page.evaluate(base => {
      const state = { usr: {
        streamUrl: `${base}/master.m3u8`, providerId: 'A',
        allStreams: [
          { providerId: 'A', providerName: 'Fixture A', streams: [{ url: `${base}/master.m3u8` }] },
          { providerId: 'B', providerName: 'Fixture B', streams: [{ url: `${base}/hang/master.m3u8` }] },
          { providerId: 'C', providerName: 'Fixture C', streams: [{ url: `${base}/720.m3u8` }] },
        ], sourceStatuses: ['A', 'B', 'C'].map(providerId => ({ providerId, providerName: `Fixture ${providerId}`, state: 'available' })),
      }, key: crypto.randomUUID(), idx: 1 }
      history.pushState(state, '', location.href.split('#')[0] + '#/player/00000001-0000-4000-8000-000000000064')
      dispatchEvent(new PopStateEvent('popstate', { state }))
    }, base)
    const video = page.locator('video')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 15000 }).toBeGreaterThan(0.1)
    const selectSource = async (id: string) => {
      await page.mouse.move(300, 300)
      await page.getByRole('button', { name: 'Playback settings', exact: true }).click()
      await page.getByRole('button', { name: /^Source/ }).click()
      await page.getByRole('button', { name: new RegExp(`Fixture ${id}`) }).click()
    }
    const stalledAt = Date.now()
    await selectSource('B')
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible({ timeout: 18000 })
    const stalledMs = Date.now() - stalledAt
    expect(stalledMs).toBeLessThan(18000)
    await expect(page.getByText('Loading video…', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 15000 }).toBeGreaterThan(0.1)
    expect(await application.evaluate(() => (globalThis as unknown as { providerFixtureCalls: string[] }).providerFixtureCalls)).toEqual(['B'])
    await page.mouse.move(300, 300)
    await page.getByRole('button', { name: 'Playback settings', exact: true }).click()
    await page.getByRole('button', { name: /^Quality/ }).click()
    await page.getByRole('button', { name: /^4K/ }).click()
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, height: element.videoHeight })), { timeout: 15000 }).toEqual({ width: 3840, height: 2160 })
    const decoded4K = await video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, height: element.videoHeight }))
    await page.screenshot({ path: join(visual, 'provider-4k.png'), animations: 'disabled' })
    await page.mouse.click(200, 200)
    const switchedAt = Date.now()
    await selectSource('C')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.videoHeight), { timeout: 5000 }).toBe(720)
    const cachedSwitchMs = Date.now() - switchedAt
    await video.evaluate((element: HTMLVideoElement) => { Object.assign(window, { fixturePosition: element.currentTime }) })
    await selectSource('D')
    await expect(page.getByText('This provider could not start. Try again or choose another source.', { exact: true })).toBeVisible()
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime > (window as unknown as { fixturePosition: number }).fixturePosition)).toBe(true)
    expect(await video.evaluate((element: HTMLVideoElement) => element.videoHeight)).toBe(720)
    expect(await application.evaluate(() => (globalThis as unknown as { providerFixtureCalls: string[] }).providerFixtureCalls)).toEqual(['B', 'D'])
    await writeFile(join(visual, 'provider-switching.json'), JSON.stringify({ stalledMs, cachedSwitchMs, decoded4K }, null, 2))
  } finally {
    await application.close()
    server.closeAllConnections()
    await new Promise<void>(done => server.close(() => done()))
    if (!resolve(directory).startsWith(resolve('.codex/tmp') + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Fixture cleanup escaped test workspace')
    await rm(directory, { recursive: true, force: true })
  }
})
