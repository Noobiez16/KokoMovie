import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const primarySurfaces = [
  '../App.tsx',
  '../components/layout/AppLayout.tsx',
  '../components/catalog/ApiKeyRequired.tsx',
  '../components/catalog/CatalogFallbackBanner.tsx',
  '../components/catalog/CategoryPagination.tsx',
  '../components/catalog/ContentCard.tsx',
  '../components/catalog/ContentRow.tsx',
  '../components/catalog/HeroBanner.tsx',
  '../pages/Browse.tsx',
  '../pages/Movies.tsx',
  '../pages/Series.tsx',
  '../pages/Search.tsx',
  '../pages/ContentDetail.tsx',
  '../pages/History.tsx',
  '../pages/Downloads.tsx',
  '../pages/Providers.tsx',
  '../pages/Settings.tsx',
] as const

const remainingSurfaces = [
  '../components/player/PlayerControls.tsx',
  '../components/player/VideoPlayer.tsx',
  '../components/player/PlayerHost.tsx',
  '../components/player/NextEpisodeButton.tsx',
  '../components/player/NextEpisodeOverlay.tsx',
  '../components/HelpCenter.tsx',
  '../components/UpdateNotification.tsx',
  '../pages/Player.tsx',
] as const

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('interface translation coverage', () => {
  it.each(primarySurfaces)('%s is connected to the translation layer', (path) => {
    expect(source(path)).toMatch(/useTranslation|\bt\s*:/)
  })

  it('does not leave primary navigation and state copy hard-coded', () => {
    const combined = primarySurfaces.map(source).join('\n')
    for (const literal of [
      '>Browse<', '>Movies<', '>Series<', '>Settings<', '>Viewing History<',
      '>My List<', '>Downloads<', '>Stream Providers<', 'No results found',
      'A TMDB API key is required', 'Continue Watching',
    ]) {
      expect(combined).not.toContain(literal)
    }
  })

  it.each(remainingSurfaces)('%s is connected to the translation layer', (path) => {
    expect(source(path)).toMatch(/useTranslation|\bt\s*:/)
  })
})
