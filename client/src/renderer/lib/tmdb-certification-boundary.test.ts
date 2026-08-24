import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TMDB certification request boundary', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/main/ipc/tmdb-repository.ts'), 'utf8')

  it('allows only the two certification subresources added for maturity filtering', () => {
    expect(source).toContain('release_dates')
    expect(source).toContain('content_ratings')
    expect(source).not.toContain('account_states')
  })
})
