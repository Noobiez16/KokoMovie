import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { isolatedCredentials } from './isolated-credentials'

// Real built renderer/main, deterministic catalog only. Never exercises provider playback.
let application: ElectronApplication
let page: Page
let directory: string
const visual = resolve('.codex/visual')

test.beforeAll(async () => {
  await mkdir(resolve('.codex/tmp'), { recursive: true })
  await mkdir(visual, { recursive: true })
  directory = await mkdtemp(resolve('.codex/tmp/platform-'))
  application = await electron.launch({ args: await isolatedCredentials(directory, 'fixture-key'), cwd: process.cwd(), env: { ...process.env, KOKOMOVIE_E2E: '1', KOKOMOVIE_OFFLINE_TEST: '1', NODE_ENV: 'test' } })
  page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await application.evaluate(({ ipcMain, session, protocol }) => {
    for (const channel of ['keychain:get-tmdb-key', 'keychain:set-tmdb-key', 'keychain:clear-tmdb-key', 'tmdb:request']) ipcMain.removeHandler(channel)
    ipcMain.handle('keychain:get-tmdb-key', () => 'fixture-key')
    ipcMain.handle('keychain:set-tmdb-key', () => undefined)
    ipcMain.handle('keychain:clear-tmdb-key', () => undefined)
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_details, callback) => callback({ cancel: true }))
    protocol.unhandle('catalog-cache')
    protocol.handle('catalog-cache', () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400"><rect width="1000" height="1400" fill="#37206d"/><circle cx="500" cy="430" r="200" fill="#7061a8"/><text x="500" y="820" fill="#eee" font-size="64" text-anchor="middle">KOKOMOVIE</text></svg>', { headers: { 'content-type': 'image/svg+xml' } }))
    ipcMain.handle('tmdb:request', (_event, input: { path: string; params: Record<string, string> }) => {
      const number = Number(input.params.page ?? 1)
      const items = Array.from({ length: 8 }, (_, i) => ({ id: number * 100 + i, title: `Fixture Movie ${number}-${i + 1}`, overview: 'A deterministic catalog fixture for desktop layout verification.', poster_path: '/fixture.jpg', backdrop_path: '/fixture.jpg', release_date: '2026-01-01', vote_average: 8.1, media_type: 'movie', original_language: 'en', runtime: 110 }))
      let result: unknown = { results: items, total_pages: 3, total_results: 24 }
      if (/\/movie\/\d+$/.test(input.path)) result = { ...items[0], genres: [], credits: { cast: [] }, external_ids: { imdb_id: null }, release_dates: { results: [] }, videos: { results: [] } }
      if (input.path === '/configuration/countries') result = [
        { iso_3166_1: 'BO', english_name: 'Bolivia', native_name: 'Bolivia' },
        { iso_3166_1: 'FR', english_name: 'France', native_name: 'France' },
      ]
      if (/\/movie\/\d+\/watch\/providers$/.test(input.path)) {
        const id = Number(input.path.split('/')[2])
        result = { id, results: {
          BO: { link: `https://www.themoviedb.org/movie/${id}/watch?locale=BO`, flatrate: [{ provider_id: 1, provider_name: 'Fixture Subscription', logo_path: '/fixture.jpg', display_priority: 1 }] },
          FR: { link: `https://www.themoviedb.org/movie/${id}/watch?locale=FR`, rent: [{ provider_id: 2, provider_name: 'Fixture Rental', logo_path: '/fixture.jpg', display_priority: 1 }] },
        } }
      }
      if (input.path.endsWith('/release_dates') || input.path.endsWith('/content_ratings')) result = { results: [] }
      return { body: JSON.stringify(result), source: 'network', stale: false }
    })
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await application?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function screenshot(name: string, width = 1440, height = 900) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width)
  await page.evaluate(() => document.getElementById('km-scroll-area')?.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(() => page.evaluate(() => document.getElementById('km-scroll-area')?.scrollTop)).toBe(0)
  await page.screenshot({ path: join(visual, `${name}-${width}.png`), animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('desktop navigation, URL search state, library and translated settings', async () => {
  const nav = page.locator('aside nav')
  await expect(nav.getByRole('link', { name: 'My List', exact: true })).toBeVisible()
  await expect(page.getByText('Fixture Movie 1-1').first()).toBeVisible()
  await screenshot('home')
  await screenshot('home', 1024, 768)
  await expect(page.locator('aside')).toHaveAttribute('data-compact', 'true')
  await page.getByRole('button', { name: 'More Info', exact: true }).click()
  await expect(page).toHaveURL(/content\//)
  await expect(page.getByRole('heading', { name: 'Fixture Movie 1-1', exact: true })).toBeVisible()
  const country = page.getByRole('combobox', { name: 'Country', exact: true })
  await expect(country).toHaveValue('')
  await expect(country.getByRole('option', { name: 'Bolivia', exact: true })).toBeAttached()
  await country.selectOption('BO')
  await expect(page.getByRole('group', { name: 'Subscription', exact: true })).toContainText('Fixture Subscription')
  await expect(page.getByText('JustWatch', { exact: false }).first()).toBeVisible()
  await country.selectOption('FR')
  await expect(page.getByRole('group', { name: 'Rent', exact: true })).toContainText('Fixture Rental')
  await expect(page.getByText('Fixture Subscription', { exact: true })).toHaveCount(0)
  await country.selectOption('BO')
  await page.reload()
  await expect(country).toHaveValue('BO')
  await expect(page.getByText('Fixture Subscription', { exact: true })).toBeVisible()
  await screenshot('detail')
  await screenshot('detail', 1024, 768)
  await nav.getByRole('link', { name: 'Home', exact: true }).click()
  const search = page.getByRole('searchbox')
  await expect(search).toHaveCount(1)
  await search.fill('fixture moon')
  await search.press('Enter')
  await expect(page).toHaveURL(/q=fixture\+moon/)
  await page.getByRole('button', { name: 'Movies', exact: true }).click()
  await expect(page).toHaveURL(/type=movie/)
  await page.getByRole('button', { name: /Next/ }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByText('Fixture Movie 2-1').first()).toBeVisible()
  await screenshot('search')
  await screenshot('search', 1024, 768)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).not.toHaveURL(/page=2/)
  await expect(page).toHaveURL(/type=movie/)
  await expect(search).toHaveValue('fixture moon')
  await page.getByRole('button', { name: /Next/ }).click()
  await search.fill('fixture stars')
  await expect(page).not.toHaveURL(/page=2/)
  await expect(page).toHaveURL(/type=movie/)
  await nav.getByRole('link', { name: 'My List', exact: true }).click()
  await expect(page).toHaveURL(/history\?tab=list/)
  await expect(nav.getByRole('link', { name: 'My List', exact: true })).toHaveAttribute('aria-current', 'page')
  await screenshot('library')
  await screenshot('library', 1024, 768)
  await page.evaluate(() => window.electronAPI.watchlistAdd('00000001-0000-4000-8000-000000000064', 'movie'))
  await page.reload()
  await expect(page.getByText('Fixture Movie 1-1').first()).toBeVisible()
  await screenshot('library-saved')
  await screenshot('library-saved', 1024, 768)
  await nav.getByRole('link', { name: 'Continue Watching', exact: true }).click()
  await expect(page).toHaveURL(/continue-watching/)
  await expect(page.getByText('Nothing to resume yet')).toBeVisible()
  await screenshot('continue')
  await screenshot('continue', 1024, 768)
  await page.evaluate(() => window.electronAPI.positionSave({ contentId: '00000001-0000-4000-8000-000000000064', contentType: 'movie', positionSeconds: 120, durationSeconds: 600, completed: false }))
  await page.reload()
  await expect(page.getByText('Fixture Movie 1-1').first()).toBeVisible()
  await screenshot('continue-saved')
  await screenshot('continue-saved', 1024, 768)
  for (const [name, route] of [['Downloads', 'downloads'], ['Providers', 'providers'], ['Settings', 'settings']]) {
    await nav.getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(route))
    await screenshot(route)
    await screenshot(route, 1024, 768)
  }
  await page.locator('button[role=combobox]').click()
  await page.getByRole('option', { name: 'Español', exact: true }).click()
  await expect(nav.getByRole('link', { name: 'Mi lista', exact: true })).toBeVisible()
  await screenshot('settings-es')
  await screenshot('settings-es', 1024, 768)
  await page.locator('button[role=combobox]').click()
  await page.getByRole('option', { name: 'Français', exact: true }).click()
  await expect(nav.getByRole('link', { name: 'Ma liste', exact: true })).toBeVisible()
  await screenshot('settings-fr')
  await screenshot('settings-fr', 1024, 768)
  await page.locator('button[role=combobox]').click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  await screenshot('settings-en')
  await page.getByRole('button', { name: 'Compact navigation', exact: true }).click()
  await expect(page.locator('aside')).toHaveAttribute('data-compact', 'true')
  await expect(nav.getByRole('link', { name: 'My List', exact: true })).toBeVisible()
  await screenshot('compact', 1024, 768)
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('searchbox')).toBeFocused()
})
