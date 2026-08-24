import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const clientDirectory = resolve(process.cwd())
const testDirectory = resolve(process.cwd(), 'src/renderer/lib')
const thisFile = resolve(testDirectory, 'security-fixture-hygiene.test.ts')
const fixtureHelper = resolve(testDirectory, 'security-test-fixtures.ts')
const forbiddenLiterals = [
  { label: 'credentialed URL', pattern: /https?:\/\/[^/'"\s:@]+:[^/'"\s@]+@/gi },
  { label: 'sensitive header', pattern: /(?:['"`]\s*)?\b(?:authorization|cookie|x-api-key)\b(?:\s*['"`])?\s*:\s*['"`][^'"`]+/gi },
  { label: 'credential field', pattern: /(?:['"`]\s*)?\b(?:credential|password)\b(?:\s*['"`])?\s*:\s*['"`][^'"`]+/gi },
]

function collectTestSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return collectTestSources(path)
    return /\.(?:test|spec)\.tsx?$/i.test(entry.name) ? [path] : []
  })
}

const filesToScan = [
  ...collectTestSources(resolve(clientDirectory, 'src')),
  ...collectTestSources(resolve(clientDirectory, 'e2e')),
  fixtureHelper,
].filter((filename) => filename !== thisFile)

function detectedLabels(contents: string) {
  return forbiddenLiterals.flatMap(({ label, pattern }) =>
    [...contents.matchAll(pattern)].map(() => label))
}

describe('security fixture hygiene', () => {
  it('covers nested tests, Electron specs, and the shared fixture helper', () => {
    expect(filesToScan).toContain(resolve(clientDirectory, 'e2e/electron-boundary.spec.ts'))
    expect(filesToScan).toContain(resolve(testDirectory, 'security-test-fixtures.ts'))
  })

  it.each([
    [['https://fixture-user', ':fixture-value', '@example.test/'].join(''), 'credentialed URL'],
    [["'author", "ization'", ": '", 'fixture-value', "'"].join(''), 'sensitive header'],
    [['"pass', 'word"', ': `', 'fixture-value', '`'].join(''), 'credential field'],
  ])('detects constructed %s fixture source', (source, expectedLabel) => {
    expect(detectedLabels(source)).toContain(expectedLabel)
  })

  it('does not commit credential-shaped literals in test sources', () => {
    const violations = filesToScan
      .flatMap((filename) => {
        const contents = readFileSync(filename, 'utf8')
        return forbiddenLiterals.flatMap(({ label, pattern }) => [...contents.matchAll(pattern)]
          .map((match) => `${relative(clientDirectory, filename)}:${contents.slice(0, match.index).split('\n').length} (${label})`))
      })

    expect(violations).toEqual([])
  })
})
