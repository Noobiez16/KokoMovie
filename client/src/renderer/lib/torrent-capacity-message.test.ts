import { expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { torrentApi } from '../api/providers'
it.each(['en-US', 'es-ES', 'fr-FR'])('explains torrent capacity in %s', async locale => {
  vi.stubGlobal('window', { electronAPI: { torrentResolve: async () => ({ error: 'TORRENT_CAPACITY_BUSY' }) } })
  await i18n.changeLanguage(locale)
  const result = await torrentApi.resolve('magnet:?xt=urn:btih:test')
  expect(result.error).toBe(i18n.t('player.torrentCapacityBusy'))
  expect(result.error).not.toMatch(/TORRENT_CAPACITY_BUSY|player\.torrentCapacityBusy/)
  vi.unstubAllGlobals()
})
