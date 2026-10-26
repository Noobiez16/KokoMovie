// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { recommendationApi } from '../api/recommendation'
import { tmdbContentId } from './tmdb'
import { useSettingsStore } from '../store/settings'

vi.mock('../store/settings', () => ({ useSettingsStore: { getState: vi.fn(() => ({ tmdbApiKey: 'fixture-key' })) } }))
const id = (number: number, type: 'movie' | 'tv' = 'movie') => tmdbContentId(type, number)
const date = new Date().toISOString()
afterEach(() => { vi.restoreAllMocks(); delete window.electronAPI })
function bridge(likes: Array<{ content_id: string; updated_at: string }> = []) {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { likesList: async () => likes, watchlistList: async () => [], positionList: async () => [] } })
}
it('makes no remote request without interests or a catalog credential', async () => {
  bridge()
  const related = vi.spyOn(recommendationApi, 'getSimilar')
  expect((await recommendationApi.getPersonalized()).data).toEqual([])
  bridge([{ content_id: id(1), updated_at: date }])
  vi.mocked(useSettingsStore.getState).mockReturnValueOnce({ tmdbApiKey: '' } as never)
  expect((await recommendationApi.getPersonalized()).data).toEqual([])
  expect(related).not.toHaveBeenCalled()
})
it('bounds calls, excludes liked titles, and retains other seeds when one endpoint fails', async () => {
  bridge(Array.from({ length: 20 }, (_, index) => ({ content_id: id(index + 1, index % 2 ? 'movie' : 'tv'), updated_at: date })))
  const related = vi.spyOn(recommendationApi, 'getSimilar').mockImplementation(async contentId => {
    if (contentId === id(1, 'tv')) throw new Error('offline seed')
    return { success: true, data: [{ id: id(100), title: 'Recommended' }, { id: id(2), title: 'Already liked' }] } as Awaited<ReturnType<typeof recommendationApi.getSimilar>>
  })
  expect((await recommendationApi.getPersonalized()).data.map(item => item.id)).toEqual([id(100)])
  expect(related).toHaveBeenCalledTimes(6)
})
