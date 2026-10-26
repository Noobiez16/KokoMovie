// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { LikeButton } from '../components/catalog/LikeButton'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('saves, reloads and removes a like and invalidates personalized suggestions', async () => {
  let liked = false
  const likeSet = vi.fn(async (input: { liked: boolean }) => { liked = input.liked; return { ok: true } })
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { likesList: async () => liked ? [{ content_id: 'film-1' }] : [], likeSet } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const mount = () => render(<QueryClientProvider client={client}><LikeButton contentId="film-1" contentType="movie" /></QueryClientProvider>)
  const view = mount()
  const button = await screen.findByRole('button', { name: 'detail.like' })
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  await userEvent.click(button)
  await waitFor(() => expect(screen.getByRole('button', { name: 'detail.liked' }).getAttribute('aria-pressed')).toBe('true'))
  expect(likeSet).toHaveBeenCalledWith({ contentId: 'film-1', contentType: 'movie', liked: true })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['recommendations', 'personalized'] })
  view.unmount(); client.clear(); mount()
  await userEvent.click(await screen.findByRole('button', { name: 'detail.liked' }))
  await screen.findByRole('button', { name: 'detail.like' })
  expect(liked).toBe(false)
})
