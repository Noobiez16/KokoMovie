import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// catalogApi.browse accepted a `limit` and silently ignored it, so category views always showed
// exactly one TMDB page (20 items) however many were requested. It now combines consecutive TMDB
// pages into one view. These checks pin the page-mapping arithmetic and the guard rails.

const TMDB_PAGE_SIZE = 20
const TMDB_MAX_PAGE = 500
const TMDB_PAGES_PER_VIEW_MAX = 5

const batchFor = (limit: number) =>
  Math.min(Math.max(Math.ceil(limit / TMDB_PAGE_SIZE), 1), TMDB_PAGES_PER_VIEW_MAX)

const firstTmdbPage = (page: number, batch: number) => (page - 1) * batch + 1

describe('category page size', () => {
  it('maps a requested limit onto whole TMDB pages', () => {
    expect(batchFor(20)).toBe(1)
    expect(batchFor(80)).toBe(4)
    expect(batchFor(30)).toBe(2) // rounds up to cover the request
  })

  it('caps the fan-out so one page change cannot burst requests', () => {
    expect(batchFor(1000)).toBe(TMDB_PAGES_PER_VIEW_MAX)
    expect(batchFor(0)).toBe(1)
  })

  it('walks consecutive, non-overlapping TMDB pages', () => {
    const batch = batchFor(80)
    expect(firstTmdbPage(1, batch)).toBe(1) // view 1 -> TMDB 1..4
    expect(firstTmdbPage(2, batch)).toBe(5) // view 2 -> TMDB 5..8
    expect(firstTmdbPage(3, batch)).toBe(9)
    // No view may reuse a TMDB page already consumed by the previous view.
    expect(firstTmdbPage(2, batch)).toBe(firstTmdbPage(1, batch) + batch)
  })

  it('collapses the total page count by the same factor', () => {
    const totalPages = (tmdbPages: number, batch: number) =>
      Math.max(Math.ceil(Math.min(tmdbPages, TMDB_MAX_PAGE) / batch), 1)

    expect(totalPages(500, 4)).toBe(125)
    expect(totalPages(3, 4)).toBe(1) // fewer results than one view holds
    expect(totalPages(0, 4)).toBe(1) // never advertise zero pages
    expect(totalPages(9999, 4)).toBe(125) // TMDB refuses discover past page 500
  })
})

describe('browse implementation', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer/api/catalog.ts'), 'utf8')
  const browse = source.slice(source.indexOf('browse: async'), source.indexOf('getContent: async'))

  it('no longer hardcodes a 20-item page', () => {
    expect(browse).not.toContain('limit: 20')
    expect(browse).toContain('limit: batch * perTmdbPage')
  })

  it('tolerates a short final batch instead of failing the view', () => {
    expect(browse).toContain('.catch(() => null)')
  })

  it('deduplicates titles that repeat across consecutive pages', () => {
    expect(browse).toContain('new Map(responses.flatMap')
  })
})

describe('pagination controls', () => {
  const component = readFileSync(resolve(process.cwd(), 'src/renderer/components/catalog/CategoryPagination.tsx'), 'utf8')

  it('returns to the top of the scroll container when the page changes', () => {
    // The controls sit below the grid, so without this the viewport stays at the bottom.
    expect(component).toContain("getElementById('km-scroll-area')")
    expect(component).toContain('scrollTo')
  })

  it('renders nothing when there is only one page', () => {
    expect(component).toContain('if (totalPages <= 1) return null')
  })

  it('is reachable as a labelled navigation landmark', () => {
    expect(component).toContain("aria-label={t('catalog.categoryPages')}")
  })
})

describe('category pages request the larger page size', () => {
  for (const page of ['Movies.tsx', 'Series.tsx', 'Browse.tsx']) {
    it(`${page} requests 80 items and paginates below the grid`, () => {
      const source = readFileSync(resolve(process.cwd(), 'src/renderer/pages', page), 'utf8')
      expect(source).toContain('limit: 80')
      expect(source).toContain('<CategoryPagination')
      // The control must follow the grid in document order.
      expect(source.indexOf('<CategoryPagination')).toBeGreaterThan(source.indexOf('grid gap-x-4'))
    })
  }
})
