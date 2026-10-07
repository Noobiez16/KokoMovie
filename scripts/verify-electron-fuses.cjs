const { copyFile, mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses')
const applyPackagedFuses = require('../client/build/after-pack.cjs')

async function main() {
  const packagedExecutable = process.argv[2] ? resolve(process.argv[2]) : null
  const temporaryDirectory = packagedExecutable ? null : await mkdtemp(join(tmpdir(), 'kokomovie-fuses-'))
  const executable = packagedExecutable || join(temporaryDirectory, 'KokoMovie.exe')
  try {
    if (temporaryDirectory) {
      await copyFile(require('electron'), executable)
      await applyPackagedFuses({
        appOutDir: temporaryDirectory,
        electronPlatformName: 'win32',
        packager: { appInfo: { productFilename: 'KokoMovie' }, executableName: 'kokomovie' },
      })
    }
    const wire = await getCurrentFuseWire(executable)
    for (const option of [
      FuseV1Options.RunAsNode,
      FuseV1Options.EnableNodeOptionsEnvironmentVariable,
      FuseV1Options.EnableNodeCliInspectArguments,
    ]) {
      if (wire[option] !== 48) throw new Error(`Fuse ${FuseV1Options[option]} was not disabled`)
    }
    process.stdout.write(packagedExecutable
      ? 'Electron production fuses verified on the supplied packaged executable.\n'
      : 'Electron production fuses verified on the installed runtime.\n')
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
