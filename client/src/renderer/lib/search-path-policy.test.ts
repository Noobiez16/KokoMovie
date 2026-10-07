import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// Exercise the actual main-process allowlist without starting Electron or SQLite.
const source = readFileSync(new URL('../../main/ipc/tmdb-repository.ts', import.meta.url), 'utf8')
const literal = /const allowedPath = \/(.+)\/\r?\n/.exec(source)
if (!literal) throw new Error('TMDB allowlist missing')
const allowed = new RegExp(literal[1])
describe('typed search IPC policy', () => {
  it.each(['/search/multi', '/search/movie', '/search/tv'])('accepts the supported search endpoint %s', (path) => expect(allowed.test(path)).toBe(true))
  it.each(['/search/person', '/search/movie/extra', 'https://example.com/search/movie', '/search/movie?query=alien'])('rejects unsupported paths %s', (path) => expect(allowed.test(path)).toBe(false))
})
