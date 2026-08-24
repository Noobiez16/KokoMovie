import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('catalog maturity integration', () => {
  const catalog = readFileSync(resolve(process.cwd(), 'src/renderer/api/catalog.ts'), 'utf8')
  const user = readFileSync(resolve(process.cwd(), 'src/renderer/api/user.ts'), 'utf8')
  const settings = readFileSync(resolve(process.cwd(), 'src/renderer/pages/Settings.tsx'), 'utf8')
  const tmdb = readFileSync(resolve(process.cwd(), 'src/renderer/lib/tmdb.ts'), 'utf8')
  const recommendations = readFileSync(resolve(process.cwd(), 'src/renderer/api/recommendation.ts'), 'utf8')

  it('loads and displays regional movie and TV certifications on detail records', () => {
    expect(tmdb).toContain("append_to_response: 'credits,external_ids,videos,release_dates'")
    expect(tmdb).toContain("append_to_response: 'credits,external_ids,videos,content_ratings'")
    expect(catalog).toContain('selectMovieCertification(m.release_dates ?? { results: [] }, region)')
    expect(catalog).toContain('selectTvCertification(tv.content_ratings ?? { results: [] }, region)')
    expect(catalog.match(/rating: certification/g)?.length).toBe(2)
  })

  it('applies the saved maximum to every online catalog collection', () => {
    expect(catalog.match(/applyCatalogMaturity\(/g)?.length).toBeGreaterThanOrEqual(6)
    expect(recommendations).toContain('applyCatalogMaturity(')
  })

  it('removes restricted saved rows and clears catalog caches after a rating change', () => {
    expect(catalog).toContain('ContentRestrictedByMaturityError')
    expect(user).toContain('instanceof ContentRestrictedByMaturityError')
    expect(user.match(/filter\(isPresent\)/g)?.length).toBe(2)
    expect(settings).toContain("payload.maturityRating")
    expect(settings).toContain("'content', 'similar', 'home', 'browse-genre', 'movies-home', 'movies-genre'")
    expect(settings).toContain("for (const queryKey of maturityDependentKeys) qc.removeQueries({ queryKey: [queryKey] })")
    const playback = readFileSync(resolve(process.cwd(), 'src/renderer/api/playback.ts'), 'utf8')
    expect(playback).toContain('instanceof ContentRestrictedByMaturityError')
  })
})
