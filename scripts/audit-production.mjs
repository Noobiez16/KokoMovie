import { spawnSync } from 'node:child_process'
import { resolveNpmCliInvocation } from './npm-cli.mjs'
import { evaluateProductionAudit } from './audit-policy.mjs'

const npm = resolveNpmCliInvocation(['audit', '--omit=dev', '--json'])
const audit = spawnSync(npm.executable, npm.args, { encoding: 'utf8' })
let blocking
try {
  blocking = evaluateProductionAudit(audit)
} catch (error) {
  console.error('Production audit failed: ' + error.message)
  if (audit.stderr) process.stderr.write(audit.stderr)
  process.exit(1)
}

if (blocking.length > 0) {
  console.error('Blocking production audit findings: ' + blocking.join(', '))
  process.exit(1)
}

console.log('Production audit passed with no high or critical findings.')
