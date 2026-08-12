export interface NpmCliOptions {
  nodeExecutable?: string
  npmExecPath?: string
}

export interface NpmCliInvocation {
  executable: string
  args: string[]
}

export function resolveNpmCliInvocation(
  args: string[],
  options?: NpmCliOptions,
): NpmCliInvocation
