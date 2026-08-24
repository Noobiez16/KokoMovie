import { describe, expect, it } from 'vitest'
import {
  certificationRegionForLocale,
  filterByMaturity,
  isCertificationAllowed,
  selectMovieCertification,
  selectTvCertification,
} from './certification-policy'

describe('region-aware maturity certification policy', () => {
  it('selects the interface region with a US fallback', () => {
    expect(certificationRegionForLocale('en-US')).toBe('US')
    expect(certificationRegionForLocale('es-ES')).toBe('ES')
    expect(certificationRegionForLocale('fr-FR')).toBe('FR')
    expect(certificationRegionForLocale('de-DE')).toBe('US')
  })

  it('ranks movie and TV certifications within each supported region', () => {
    expect(isCertificationAllowed('PG-13', 'PG-13', 'US')).toBe(true)
    expect(isCertificationAllowed('R', 'PG-13', 'US')).toBe(false)
    expect(isCertificationAllowed('TV-14', 'PG-13', 'US')).toBe(true)
    expect(isCertificationAllowed('16', 'PG-13', 'ES')).toBe(false)
    expect(isCertificationAllowed('-12', 'PG-13', 'FR')).toBe(true)
  })

  it('blocks unrated content for restricted profiles and allows it only at TV-MA', () => {
    expect(isCertificationAllowed(null, 'R', 'US')).toBe(false)
    expect(isCertificationAllowed('', 'PG', 'ES')).toBe(false)
    expect(isCertificationAllowed(null, 'TV-MA', 'FR')).toBe(true)
  })

  it('chooses regional TMDB movie and TV values before the US fallback', () => {
    expect(selectMovieCertification({ results: [
      { iso_3166_1: 'US', release_dates: [{ certification: 'R', type: 3 }] },
      { iso_3166_1: 'ES', release_dates: [{ certification: '16', type: 3 }] },
    ] }, 'ES')).toBe('16')
    expect(selectTvCertification({ results: [
      { iso_3166_1: 'US', rating: 'TV-14' },
      { iso_3166_1: 'FR', rating: '-12' },
    ] }, 'FR')).toBe('-12')
    expect(selectTvCertification({ results: [{ iso_3166_1: 'US', rating: 'TV-PG' }] }, 'ES')).toBe('TV-PG')
  })

  it('enriches and removes over-limit or unrated catalog summaries', async () => {
    const items = [
      { id: 'family', type: 'movie' as const, rating: null as string | null },
      { id: 'adult', type: 'series' as const, rating: null as string | null },
      { id: 'unrated', type: 'movie' as const, rating: null as string | null },
    ]
    const filtered = await filterByMaturity(items, 'PG-13', 'US', async (item) => ({ family: 'PG', adult: 'TV-MA', unrated: null })[item.id] ?? null)
    expect(filtered).toEqual([{ id: 'family', type: 'movie', rating: 'PG' }])
  })
})
