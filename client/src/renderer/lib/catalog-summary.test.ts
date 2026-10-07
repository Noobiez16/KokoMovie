import { expect, it } from 'vitest'
import { tmdbItemsToSummaries } from '../api/catalog'

it('preserves the catalog synopsis for the featured title without an extra detail request', () => {
  const [summary] = tmdbItemsToSummaries([{ id: 12, title: 'A Film', overview: 'A story beyond the stars.', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', vote_average: 8, original_language: 'en', media_type: 'movie' }])
  expect(summary).toHaveProperty('description', 'A story beyond the stars.')
})
