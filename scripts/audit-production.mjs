import { spawnSync } from 'node:child_process'
import { resolveNpmCliInvocation } from './npm-cli.mjs'

const npm = resolveNpmCliInvocation(['audit', '--omit=dev', '--json'])
const audit = spawnSync(npm.executable, npm.args, { encoding: 'utf8' })
let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  process.stderr.write(audit.stderr || 'npm audit did not return valid JSON\n')
  process.exit(1)
}

const vulnerabilities = report.vulnerabilities ?? {}
const blocking = []

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if (vulnerability.severity !== 'high' && vulnerability.severity !== 'critical') continue
  blocking.push(name + ' (' + vulnerability.severity + ')')
}

if (blocking.length > 0) {
  console.error('Blocking production audit findings: ' + blocking.join(', '))
  process.exit(1)
}

console.log('Production audit passed with no high or critical findings.')
