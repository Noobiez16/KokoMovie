import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Execute the actual main request schema path pattern, rather than a substring contract.
const source = readFileSync(resolve(process.cwd(), 'src/main/ipc/tmdb-repository.ts'), 'utf8')
const pattern = source.match(/const allowedPath = (\/.*\/[a-z]*)\r?\n/)![1]!
const allowlist = new RegExp(pattern.slice(1, pattern.lastIndexOf('/')), pattern.slice(pattern.lastIndexOf('/') + 1))
describe('TMDB availability GET path boundary', () => {
  it.each(['/movie/603/watch/providers', '/tv/1399/watch/providers', '/configuration/countries'])('allows %s', (path) => expect(allowlist.test(path)).toBe(true))
  it.each(['/movie/603/watch/providers/extra', '/tv/1399/watch', '/watch/providers/movie', '/configuration/countries/US', '/configuration/jobs', '/movie/603/account_states', 'https://api.themoviedb.org/3/movie/603/watch/providers', '/movie/603/watch/providers?locale=US', '/movie/../watch/providers'])('rejects %s', (path) => expect(allowlist.test(path)).toBe(false))
})
