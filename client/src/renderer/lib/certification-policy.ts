export type MaturityMaximum = 'G' | 'PG' | 'PG-13' | 'R' | 'TV-MA'
export type CertificationRegion = 'US' | 'ES' | 'FR'

export interface MovieCertificationResponse {
  results: Array<{
    iso_3166_1: string
    release_dates: Array<{ certification: string; type: number }>
  }>
}

export interface TvCertificationResponse {
  results: Array<{ iso_3166_1: string; rating: string }>
}

const MAXIMUM_RANK: Record<MaturityMaximum, number> = {
  G: 0,
  PG: 1,
  'PG-13': 2,
  R: 3,
  'TV-MA': 4,
}

const REGION_RANKS: Record<CertificationRegion, Record<string, number>> = {
  US: {
    G: 0, 'TV-Y': 0, 'TV-Y7': 0, 'TV-G': 0,
    PG: 1, 'TV-PG': 1,
    'PG-13': 2, 'TV-14': 2,
    R: 3,
    'NC-17': 4, 'TV-MA': 4,
  },
  ES: {
    A: 0, TP: 0, '7': 0, '7I': 0,
    '12': 1, '13': 2,
    '16': 3,
    '18': 4, X: 4,
  },
  FR: {
    U: 0, TP: 0, 'TOUS PUBLICS': 0,
    '-10': 1, '10': 1,
    '-12': 2, '12': 2,
    '-16': 3, '16': 3,
    '-18': 4, '18': 4,
  },
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

export function certificationRegionForLocale(locale: string): CertificationRegion {
  const region = locale.replace('_', '-').split('-')[1]?.toUpperCase()
  return region === 'ES' || region === 'FR' ? region : 'US'
}

export function isCertificationAllowed(
  certification: string | null | undefined,
  maximum: string,
  region: CertificationRegion,
): boolean {
  const maxRank = MAXIMUM_RANK[maximum as MaturityMaximum] ?? MAXIMUM_RANK['TV-MA']
  const value = normalized(certification)
  if (!value) return maxRank === MAXIMUM_RANK['TV-MA']
  const rank = REGION_RANKS[region][value]
  if (rank === undefined) return maxRank === MAXIMUM_RANK['TV-MA']
  return rank <= maxRank
}

function regionOrder(region: CertificationRegion): string[] {
  return region === 'US' ? ['US'] : [region, 'US']
}

export function selectMovieCertification(response: MovieCertificationResponse, region: CertificationRegion): string | null {
  for (const code of regionOrder(region)) {
    const releases = response.results.find((entry) => entry.iso_3166_1.toUpperCase() === code)?.release_dates ?? []
    const preferred = [...releases]
      .filter((release) => normalized(release.certification))
      .sort((a, b) => [3, 2, 1, 4, 5, 6].indexOf(a.type) - [3, 2, 1, 4, 5, 6].indexOf(b.type))[0]
    if (preferred) return preferred.certification.trim()
  }
  return null
}

export function selectTvCertification(response: TvCertificationResponse, region: CertificationRegion): string | null {
  for (const code of regionOrder(region)) {
    const match = response.results.find((entry) => entry.iso_3166_1.toUpperCase() === code && normalized(entry.rating))
    if (match) return match.rating.trim()
  }
  return null
}

export async function filterByMaturity<T extends { rating: string | null }>(
  items: T[],
  maximum: string,
  region: CertificationRegion,
  loadCertification: (item: T) => Promise<string | null>,
): Promise<T[]> {
  if (maximum === 'TV-MA') return items
  const rated = await Promise.all(items.map(async (item) => {
    const rating = item.rating ?? await loadCertification(item)
    return { item: { ...item, rating }, allowed: isCertificationAllowed(rating, maximum, region) }
  }))
  return rated.filter((entry) => entry.allowed).map((entry) => entry.item)
}
