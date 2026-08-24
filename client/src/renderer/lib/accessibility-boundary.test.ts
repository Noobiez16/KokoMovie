import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('keyboard and menu accessibility boundaries', () => {
  const history = readFileSync(resolve(process.cwd(), 'src/renderer/pages/History.tsx'), 'utf8')
  const detail = readFileSync(resolve(process.cwd(), 'src/renderer/pages/ContentDetail.tsx'), 'utf8')

  it('exposes tab state and native history/watchlist actions', () => {
    expect(history).toContain('aria-pressed={activeTab === tab}')
    expect(history).toContain('aria-label={item.contentTitle}')
    expect(history).toContain("aria-label={item.title || t('history.unknownTitle')}")
  })

  it('exposes episode menu state and menu roles', () => {
    expect(detail).toContain('aria-haspopup="menu"')
    expect(detail).toContain('aria-expanded={activeEpisodeDropdownId === ep.id}')
    expect(detail).toContain('role="menu"')
    expect(detail).toContain('role="menuitem"')
  })
})
