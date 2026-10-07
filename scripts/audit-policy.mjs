const severities = ['info', 'low', 'moderate', 'high', 'critical']
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// npm uses exit 1 for valid reports containing vulnerabilities as well as errors.
// Accept that exit only after verifying the report and its severity totals.
export function evaluateProductionAudit(audit) {
  if (audit.error) throw new Error('npm audit could not run: ' + audit.error.message)
  if (audit.signal) throw new Error('npm audit terminated by signal ' + audit.signal)
  if (audit.status !== 0 && audit.status !== 1) {
    throw new Error('npm audit exited with unexpected status ' + audit.status)
  }

  let report
  try {
    report = JSON.parse(audit.stdout)
  } catch {
    throw new Error('npm audit did not return valid JSON')
  }
  if (!isObject(report)) throw new Error('npm audit returned an invalid report')
  if (Object.hasOwn(report, 'error')) {
    throw new Error('npm audit returned an operational error: ' + (report.error?.code || 'unknown error'))
  }
  if (report.auditReportVersion !== 2 || !isObject(report.vulnerabilities) ||
      !isObject(report.metadata) || !isObject(report.metadata.vulnerabilities)) {
    throw new Error('npm audit report is missing valid vulnerability metadata')
  }

  const counts = report.metadata.vulnerabilities
  const observed = Object.fromEntries(severities.map((severity) => [severity, 0]))
  const blocking = []
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!isObject(vulnerability) || !severities.includes(vulnerability.severity)) {
      throw new Error('npm audit returned an invalid vulnerability for ' + name)
    }
    observed[vulnerability.severity]++
    if (vulnerability.severity === 'high' || vulnerability.severity === 'critical') {
      blocking.push(name + ' (' + vulnerability.severity + ')')
    }
  }
  for (const severity of [...severities, 'total']) {
    const expected = severity === 'total' ? Object.keys(report.vulnerabilities).length : observed[severity]
    if (!Number.isSafeInteger(counts[severity]) || counts[severity] < 0 || counts[severity] !== expected) {
      throw new Error('npm audit returned invalid or inconsistent ' + severity + ' vulnerability counts')
    }
  }
  if (audit.status === 1 && counts.total === 0) {
    throw new Error('npm audit exited with status 1 despite reporting no vulnerabilities')
  }
  return blocking
}
