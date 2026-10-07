// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const state = vi.hoisted(() => ({ appRender: vi.fn(), roots: [] as { unmount: () => void }[] }))
vi.mock('react-dom/client', async (original) => {
  const actual = await original<typeof import('react-dom/client')>()
  return { ...actual, createRoot: (...args: Parameters<typeof actual.createRoot>) => {
    const root = actual.createRoot(...args)
    state.roots.push(root)
    return root
  } }
})
vi.mock('../App', () => ({ App: () => { state.appRender(); return <p>Desktop application mounted</p> } }))
vi.mock('../i18n/LocaleBootstrap', () => ({ LocaleBootstrap: ({ children }: { children: ReactNode }) => children }))
vi.mock('@tanstack/react-query-devtools', () => ({ ReactQueryDevtools: () => null }))

beforeEach(() => {
  vi.resetModules()
  state.appRender.mockClear()
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(() => {
  act(() => { for (const root of state.roots.splice(0)) root.unmount() })
  vi.unstubAllGlobals()
})

it('explains the desktop requirement instead of mounting privileged flows in a browser', async () => {
  vi.stubGlobal('electronAPI', undefined)
  await act(async () => { await import('../main') })
  expect(screen.getByRole('heading', { name: 'Open KokoMovie in the desktop app' })).toBeDefined()
  expect(screen.getByText(/npm run dev/)).toBeDefined()
  expect(state.appRender).not.toHaveBeenCalled()
})

it('keeps mounting the desktop application when the preload bridge exists', async () => {
  vi.stubGlobal('electronAPI', {})
  await act(async () => { await import('../main') })
  expect(screen.getByText('Desktop application mounted')).toBeDefined()
  expect(state.appRender).toHaveBeenCalled()
  expect(screen.queryByRole('heading', { name: 'Open KokoMovie in the desktop app' })).toBeNull()
})
