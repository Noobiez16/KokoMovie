// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SourceQualityNotice } from '../components/player/SourceQualityNotice'
import { classifySourceQuality } from '../../main/providers/source-quality'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
afterEach(cleanup)
it('warns for an unverified movie even if no provider release metadata was supplied', () => {
  render(<SourceQualityNotice mediaUrl="https://fixture.invalid/master.m3u8" movie />)
  expect(screen.getByRole('status').textContent).toBe('player.unverifiedNotice')
})
it('shows an explicit camera warning and resets dismissal after a source change', () => {
  const quality = classifySourceQuality({ url: 'https://fixture.invalid/HDCAM/master.m3u8', resolution: 1080 })
  const view = render(<SourceQualityNotice quality={quality} mediaUrl="https://fixture.invalid/one.m3u8" movie />)
  expect(screen.getByRole('alert').textContent).toBe('player.camNotice')
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
  expect(screen.queryByRole('alert')).toBeNull()
  view.rerender(<SourceQualityNotice quality={quality} mediaUrl="https://fixture.invalid/two.m3u8" movie />)
  expect(screen.getByRole('alert')).toBeTruthy()
})
it('does not warn about local offline files or a source with standard-release evidence', () => {
  const view = render(<SourceQualityNotice mediaUrl="offline://download/video.mp4" movie />)
  expect(view.container.textContent).toBe('')
  view.rerender(<SourceQualityNotice mediaUrl="blob:offline-manifest" movie />)
  expect(view.container.textContent).toBe('')
  view.rerender(<SourceQualityNotice quality={classifySourceQuality({ url: 'https://fixture.invalid/web-dl/master.m3u8', resolution: 1080 })} mediaUrl="https://fixture.invalid/web-dl/master.m3u8" movie />)
  expect(view.container.textContent).toBe('')
})
