import { spawnSync } from 'node:child_process'
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

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if (vulnerability.severity !== 'high' && vulnerability.severity !== 'critical') continue
  blocking.push(name + ' (' + vulnerability.severity + ')')
}

if (blocking.length > 0) {
  console.error('Blocking production audit findings: ' + blocking.join(', '))
  process.exit(1)
}

console.log('Production audit passed with no high or critical findings.')
