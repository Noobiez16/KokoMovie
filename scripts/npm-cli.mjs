export function resolveNpmCliInvocation(args, options = {}) {
  const nodeExecutable = options.nodeExecutable ?? process.execPath
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath
  if (!npmExecPath) {
    throw new Error('npm_execpath is unavailable; run this gate through npm')
  }
  return { executable: nodeExecutable, args: [npmExecPath, ...args] }
}
