import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const allowedAdvisory = 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2'
const allowedPackages = new Set(['react-router', 'react-router-dom'])
const clientPackage = JSON.parse(readFileSync(new URL('../client/package.json', import.meta.url), 'utf8'))

if (clientPackage.dependencies?.['react-router-dom'] !== '7.18.2') {
  console.error('Audit exception is valid only for the reviewed react-router-dom 7.18.2 dependency.')
  process.exit(1)
}

const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' })
let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  process.stderr.write(audit.stderr || 'npm audit did not return valid JSON\n')
  process.exit(1)
}

const vulnerabilities = report.vulnerabilities ?? {}
const blocking = []
let reviewedExceptionPresent = false

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if (vulnerability.severity !== 'high' && vulnerability.severity !== 'critical') continue
  const via = Array.isArray(vulnerability.via) ? vulnerability.via : []
  const urls = via.flatMap((entry) => typeof entry === 'object' && entry && typeof entry.url === 'string' ? [entry.url] : [])
  if (allowedPackages.has(name) && (urls.includes(allowedAdvisory) || via.includes('react-router'))) {
    reviewedExceptionPresent = true
    continue
  }
  blocking.push(name + ' (' + vulnerability.severity + ')')
}

if (!reviewedExceptionPresent) {
  console.error('The reviewed React Router RSC advisory was not present; remove or update the exception policy.')
  process.exit(1)
}
if (blocking.length > 0) {
  console.error('Blocking production audit findings: ' + blocking.join(', '))
  process.exit(1)
}

console.log('Production audit passed with one reviewed RSC-only exception: GHSA-qwww-vcr4-c8h2')
