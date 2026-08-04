import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// The v1.5.1 Windows release failed three times in a row on packaging alone. The last failure was
// `win.sign: false` — `sign` is the electron-builder 27 spelling and does not exist in 26, whose
// `win` block is declared with additionalProperties:false, so one unknown key invalidates the
// whole object. Nothing caught it until electron-builder itself ran, which only happens after the
// quality gate and a full renderer build have already succeeded on a packaging runner.
//
// These configs are now validated against the schema electron-builder actually ships, in the unit
// suite, so a bad key fails in seconds rather than after a multi-job CI round trip.

const require = createRequire(import.meta.url)
const repoRoot = resolve(process.cwd(), '..')

// js-yaml ships no type declarations; loading it through require keeps the strict typecheck happy
// without adding a devDependency purely for this test.
const yaml = require(resolve(repoRoot, 'node_modules/js-yaml')) as {
  load: (input: string) => unknown
}

const schema = JSON.parse(
  readFileSync(resolve(repoRoot, 'node_modules/app-builder-lib/scheme.json'), 'utf8'),
)

// Prefer the ajv that app-builder-lib validates with; fall back to the hoisted copy. Both accept
// this draft-07 schema and both reject the key that broke the release.
function loadAjv(): new (options: Record<string, unknown>) => {
  compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: { instancePath?: string; message?: string }[] }
} {
  for (const id of ['app-builder-lib/node_modules/ajv', 'ajv']) {
    try {
      const mod = require(resolve(repoRoot, 'node_modules', id))
      return mod.default ?? mod
    } catch {
      continue
    }
  }
  throw new Error('No ajv available to validate the electron-builder configuration.')
}

const Ajv = loadAjv()

// Mirrors app-builder-lib/out/util/config/schemaValidator.js.
const validate = new Ajv({ allErrors: true, verbose: true, coerceTypes: true, strict: false })
  .compile(schema)

function loadConfig(target: string): Record<string, unknown> {
  const file = resolve(repoRoot, 'client', `electron-builder.${target}.yml`)
  return yaml.load(readFileSync(file, 'utf8')) as Record<string, unknown>
}

function failures(config: unknown): string[] {
  if (validate(config)) return []
  return (validate.errors ?? [])
    .filter(error => !['anyOf', 'oneOf', 'if'].includes((error as { keyword?: string }).keyword ?? ''))
    .map(error => `${error.instancePath || '/'} ${error.message}`)
}

describe('electron-builder configuration', () => {
  it.each(['linux', 'win', 'mac'])('%s config matches the shipped schema', target => {
    expect(failures(loadConfig(target))).toEqual([])
  })

  it('rejects the win.sign key that broke the v1.5.1 Windows release', () => {
    const config = loadConfig('win')
    const win = config.win as Record<string, unknown>
    delete win.signExecutable
    win.sign = false

    // Proves the validator is strict enough to have caught the original defect, rather than
    // passing everything and giving false confidence.
    expect(failures(config).length).toBeGreaterThan(0)
  })

  it('keeps Windows code signing off while retaining resource editing', () => {
    const win = loadConfig('win').win as Record<string, unknown>
    expect(win.signExecutable).toBe(false)
    // signAndEditExecutable must stay on, otherwise the icon and version metadata are dropped.
    expect(win.signAndEditExecutable).toBeUndefined()
  })
})
