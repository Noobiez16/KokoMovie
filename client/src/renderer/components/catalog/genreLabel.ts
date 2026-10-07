import type { TFunction } from 'i18next'

const genreKeys: Record<string, string> = {
  action: 'action', comedy: 'comedy', drama: 'drama', 'sci-fi': 'sciFi',
  horror: 'horror', thriller: 'thriller', romance: 'romance', animation: 'animation',
  documentary: 'documentary', fantasy: 'fantasy', mystery: 'mystery', crime: 'crime',
}

/** Translate our known catalog genres without inventing labels for custom slugs. */
export function genreLabel(slug: string, suppliedName: string, t: TFunction): string {
  const key = genreKeys[slug]
  return key ? t(`catalog.genres.${key}`) : suppliedName
}
