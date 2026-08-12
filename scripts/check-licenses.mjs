// Distribution licence gate.
//
// KokoMovie is distributed under GPL-3.0-or-later and ships a bundled LGPL-3.0 FFmpeg
// executable. This script fails the build when anything in the *production* dependency graph,
// the vendored FFmpeg build, or the project's own licence declarations would make that
// distribution non-compliant.
//
//   node scripts/check-licenses.mjs            verify (exit non-zero on any violation)
//   node scripts/check-licenses.mjs --report   print the production licence inventory
//
// Dev-only tooling is out of scope: it is never redistributed.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveNpmCliInvocation } from './npm-cli.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_LICENSE = 'GPL-3.0-or-later'

// Licences that may be combined into a GPL-3.0-or-later distribution.
const COMPATIBLE = new Set([
  '0BSD', 'AFL-2.1', 'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'APACHE-2.0',
  'ARTISTIC-2.0', 'BLUEOAK-1.0.0', 'BSD', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE', 'BSD-3-CLAUSE-CLEAR',
  'CC-BY-3.0', 'CC-BY-4.0', 'CC0-1.0', 'GPL-2.0-OR-LATER', 'GPL-3.0', 'GPL-3.0-ONLY',
  'GPL-3.0-OR-LATER', 'ISC', 'LGPL-2.1-OR-LATER', 'LGPL-3.0', 'LGPL-3.0-ONLY',
  'LGPL-3.0-OR-LATER', 'MIT', 'MIT-0', 'MPL-2.0', 'PYTHON-2.0', 'UNLICENSE', 'W3C', 'WTFPL',
  'X11', 'ZLIB',
])

// Licences that are known to be incompatible with GPL-3.0 distribution. Anything not in either
// set is treated as unknown and also fails, so the gate is fail-closed.
const INCOMPATIBLE = new Set([
  'BUSL-1.1', 'CDDL-1.0', 'CDDL-1.1', 'CPAL-1.0', 'EPL-1.0', 'EPL-2.0', 'GPL-2.0',
  'GPL-2.0-ONLY', 'MPL-1.1', 'NPL-1.1', 'OSL-3.0', 'SSPL-1.0', 'UNLICENSED',
])

// Packages that predate SPDX `license` and declare their terms elsewhere. Each entry records the
// licence proven by reading the package's own LICENSE file, so the gate stays fail-closed.
const REVIEWED = {
  // Uses the legacy `licenses: [{ type: 'MIT' }]` array; LICENSE.txt is the MIT text.
  'limiter': 'MIT',
}

function normalize(value) {
  return String(value).trim().toUpperCase().replace(/^\(|\)$/g, '')
}

// Evaluates SPDX expressions: OR passes when any operand is compatible, AND requires all of them.
function isCompatible(expression) {
  const spdx = normalize(expression)
  if (COMPATIBLE.has(spdx)) return true
  if (INCOMPATIBLE.has(spdx)) return false
  if (spdx.includes(' OR ')) return spdx.split(' OR ').some((part) => isCompatible(part))
  if (spdx.includes(' AND ')) return spdx.split(' AND ').every((part) => isCompatible(part))
  // Tolerate non-SPDX spellings such as "MPL 2.0" and "Apache License 2.0".
  const collapsed = spdx.replace(/\s+/g, '-').replace(/-LICENSE-/, '-')
  if (COMPATIBLE.has(collapsed)) return true
  if (INCOMPATIBLE.has(collapsed)) return false
  return null // unknown
}

function declaredLicense(node) {
  if (typeof node.license === 'string') return node.license
  if (node.license && typeof node.license.type === 'string') return node.license.type

  // `npm query` omits the deprecated `licenses` array, so fall back to the manifest on disk.
  const manifestPath = join(node.realpath ?? join(repoRoot, node.location ?? ''), 'package.json')
  if (!existsSync(manifestPath)) return null
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (typeof manifest.license === 'string') return manifest.license
  if (manifest.license?.type) return manifest.license.type
  if (Array.isArray(manifest.licenses) && manifest.licenses.length > 0) {
    return manifest.licenses.map((entry) => entry.type ?? entry).join(' OR ')
  }
  return null
}

function productionPackages() {
  const npm = resolveNpmCliInvocation(['query', '.prod'])
  const raw = execFileSync(npm.executable, npm.args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(raw).filter((node) => node.location) // drop the workspace roots
}

const problems = []

// ── 1. The project's own licence declarations ──────────────────────────────
const licensePath = join(repoRoot, 'LICENSE')
if (!existsSync(licensePath)) {
  problems.push('LICENSE is missing; a distributed release must carry its licence text.')
} else {
  const text = readFileSync(licensePath, 'utf8')
  if (!text.includes('GNU GENERAL PUBLIC LICENSE') || !text.includes('Version 3')) {
    problems.push('LICENSE does not contain the GNU GPL version 3 text.')
  }
}

for (const manifest of ['package.json', 'client/package.json']) {
  const declared = JSON.parse(readFileSync(join(repoRoot, manifest), 'utf8')).license
  if (declared !== PROJECT_LICENSE) {
    problems.push(`${manifest} declares license "${declared ?? '(none)'}"; expected "${PROJECT_LICENSE}".`)
  }
}

// ── 2. The bundled FFmpeg executable ───────────────────────────────────────
// FFmpeg is the one redistributed binary that is not an npm package. A GPL build here is what
// blocked the previous release, so its recorded provenance is verified whenever it is vendored.
const { FFMPEG_TARGETS } = await import('./fetch-ffmpeg.mjs')
let vendoredTargets = 0
for (const target of Object.keys(FFMPEG_TARGETS)) {
  const provenancePath = join(repoRoot, 'client', 'vendor', 'ffmpeg', target, 'PROVENANCE.json')
  if (!existsSync(provenancePath)) continue
  vendoredTargets += 1
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'))
  if (!provenance.license.startsWith('LGPL')) {
    problems.push(`Vendored FFmpeg for ${target} is ${provenance.license}; only an LGPL build may ship.`)
  }
  if (provenance.sha256 !== FFMPEG_TARGETS[target].sha256) {
    problems.push(`Vendored FFmpeg for ${target} does not match the pinned digest; re-run npm run vendor:ffmpeg.`)
  }
  for (const flag of ['--enable-gpl', '--enable-nonfree', '--enable-libx264', '--enable-libx265']) {
    if (provenance.configuration.includes(flag)) {
      problems.push(`Vendored FFmpeg for ${target} was configured with ${flag}.`)
    }
  }
}

// ── 3. Production dependency graph ─────────────────────────────────────────
const inventory = []
for (const node of productionPackages()) {
  const license = REVIEWED[node.name] ?? declaredLicense(node)
  const verdict = license === null ? null : isCompatible(license)
  inventory.push({ name: node.name, version: node.version, license: license ?? '(undeclared)', compatible: verdict })

  if (license === null) {
    problems.push(`${node.name}@${node.version} declares no licence; review it and add it to REVIEWED.`)
  } else if (verdict === false) {
    problems.push(`${node.name}@${node.version} is ${license}, which cannot be distributed under ${PROJECT_LICENSE}.`)
  } else if (verdict === null) {
    problems.push(`${node.name}@${node.version} has unrecognised licence "${license}"; classify it explicitly.`)
  }
}

// ── Output ─────────────────────────────────────────────────────────────────
if (process.argv.includes('--report')) {
  const counts = inventory.reduce((acc, entry) => acc.set(entry.license, (acc.get(entry.license) ?? 0) + 1), new Map())
  console.log(`Production packages: ${inventory.length}\n`)
  for (const [license, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(String(count).padStart(4) + '  ' + license)
  }
  console.log('\nBundled non-npm components:')
  console.log('   1  LGPL-3.0-or-later  FFmpeg (' + vendoredTargets + ' target(s) vendored locally)')
}

if (problems.length > 0) {
  console.error('\nLicence gate failed:')
  for (const problem of problems) console.error('  - ' + problem)
  process.exit(1)
}

console.log(`Licence gate passed: ${inventory.length} production packages compatible with ${PROJECT_LICENSE}; ${vendoredTargets} vendored FFmpeg target(s) verified LGPL.`)
