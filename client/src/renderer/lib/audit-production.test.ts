import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }))
vi.mock('node:child_process', () => ({ spawnSync }))
vi.mock('../../../../scripts/npm-cli.mjs', () => ({
  resolveNpmCliInvocation: () => ({ executable: 'node', args: ['npm', 'audit', '--omit=dev', '--json'] }),
}))

function report(severities: string[] = []) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: severities.length }
  const vulnerabilities = Object.fromEntries(severities.map((severity, index) => {
    counts[severity as keyof typeof counts]++
    return ['package-' + index, { severity }]
  }))
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } }
}

async function run(stdout: unknown, overrides = {}) {
  vi.resetModules()
  spawnSync.mockReturnValue({ stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout), stderr: '', status: 0, signal: null, ...overrides })
  const exit = vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error('exit:' + code) })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    const auditScriptPath = new URL('../../../../scripts/audit-production.mjs', import.meta.url).href
    await import(auditScriptPath)
    return 0
  } catch (error) {
    if (exit.mock.calls.length) return exit.mock.calls[0][0]
    throw error
  }
}

afterEach(() => vi.restoreAllMocks())

describe('production audit CLI gate', () => {
  it.each([
    ['npm error envelope', { error: { code: 'ENOAUDIT' } }, { status: 1 }],
    ['invalid JSON', '{', {}],
    ['null JSON', null, {}],
    ['missing vulnerabilities', { auditReportVersion: 2 }, {}],
    ['invalid vulnerabilities', { ...report(), vulnerabilities: [] }, {}],
    ['missing metadata', { auditReportVersion: 2, vulnerabilities: {} }, {}],
    ['invalid counts', { ...report(), metadata: { vulnerabilities: { total: 0 } } }, {}],
    ['mismatched counts', { ...report(['low']), vulnerabilities: {} }, {}],
    ['unsupported version', { ...report(), auditReportVersion: 1 }, {}],
    ['unknown severity', report(['unknown']), {}],
    ['unexpected exit', report(), { status: 2 }],
    ['clean report with failure exit', report(), { status: 1 }],
    ['signal', report(), { status: null, signal: 'SIGTERM' }],
    ['spawn error', report(), { status: null, error: new Error('ENOENT') }],
  ])('fails closed for %s', async (_name, stdout, overrides) => {
    expect(await run(stdout, overrides)).toBe(1)
  })

  it.each([0, 1])('accepts valid low/moderate report with npm exit %i', async (status) => {
    expect(await run(report(['low', 'moderate']), { status })).toBe(0)
  })
  it('accepts a valid clean report', async () => expect(await run(report())).toBe(0))
  it.each(['high', 'critical'])('blocks %s vulnerabilities', async (severity) => {
    expect(await run(report([severity]), { status: 1 })).toBe(1)
  })
})
