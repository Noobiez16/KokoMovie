import { describe, expect, it } from 'vitest'
import { sanitizeMediaUrl } from './media-url'

describe('sanitizeMediaUrl', () => {
  it('allows the app-owned schemes that tmdbImageUrl actually produces in Electron', () => {
    // Regression: these were rejected, so every image on the content detail page rendered blank.
    expect(sanitizeMediaUrl('catalog-cache://image/w1280/abc.jpg')).toBe('catalog-cache://image/w1280/abc.jpg')
    expect(sanitizeMediaUrl('offline://download/1/poster.jpg')).toBe('offline://download/1/poster.jpg')
  })

  it('allows remote images, relative paths, and inline image data', () => {
    expect(sanitizeMediaUrl('https://image.tmdb.org/t/p/w1280/a.jpg')).toBe('https://image.tmdb.org/t/p/w1280/a.jpg')
    expect(sanitizeMediaUrl('http://image.tmdb.org/t/p/w1280/a.jpg')).toBe('http://image.tmdb.org/t/p/w1280/a.jpg')
    expect(sanitizeMediaUrl('/assets/placeholder.png')).toBe('/assets/placeholder.png')
    expect(sanitizeMediaUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('rejects script-bearing and non-image URLs', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'data:text/html,<script>alert(1)</script>',
      'catalog-cache:image/w1280/a.jpg', // missing //, not the registered standard-scheme form
      'not-a-url',
    ]) {
      expect(sanitizeMediaUrl(hostile), hostile).toBe('')
    }
  })

  it('treats missing values as empty', () => {
    expect(sanitizeMediaUrl(null)).toBe('')
    expect(sanitizeMediaUrl(undefined)).toBe('')
    expect(sanitizeMediaUrl('   ')).toBe('')
  })
})
