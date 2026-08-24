import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TV season scheduling integration', () => {
  const catalog = readFileSync(resolve(process.cwd(), 'src/renderer/api/catalog.ts'), 'utf8')
  const detail = readFileSync(resolve(process.cwd(), 'src/renderer/pages/ContentDetail.tsx'), 'utf8')

  it('returns season metadata with only the default season populated initially', () => {
    expect(catalog).toContain('const defaultSeasonNumber = realSeasons[0]?.season_number')
    expect(catalog).toContain('c.getSeason(decoded.tmdbId, defaultSeasonNumber)')
    expect(catalog).not.toContain('realSeasons.map((s) => c.getSeason')
  })

  it('loads the selected season on demand and prefetches only adjacent seasons', () => {
    expect(catalog).toContain('getSeason: async (contentId: string, seasonNumber: number)')
    expect(detail).toContain("queryKey: ['season', id, selectedSeasonNumber]")
    expect(detail).toContain('prefetchSeason(selectedIndex - 1)')
    expect(detail).toContain('prefetchSeason(selectedIndex + 1)')
  })
})
