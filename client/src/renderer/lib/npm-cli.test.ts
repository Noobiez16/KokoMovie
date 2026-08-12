import { describe, expect, it } from 'vitest'
import { resolveNpmCliInvocation } from '../../../../scripts/npm-cli.mjs'

describe('npm CLI invocation', () => {
  it('runs the active npm CLI through Node so Windows batch shims are not required', () => {
    expect(resolveNpmCliInvocation(['audit', '--json'], {
      nodeExecutable: 'C:/Program Files/nodejs/node.exe',
      npmExecPath: 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
    })).toEqual({
      executable: 'C:/Program Files/nodejs/node.exe',
      args: ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'audit', '--json'],
    })
  })

  it('fails clearly when npm did not provide its CLI path', () => {
    expect(() => resolveNpmCliInvocation([], {
      nodeExecutable: 'node',
      npmExecPath: '',
    })).toThrow(/npm_execpath/i)
  })
})
