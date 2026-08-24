const { copyFile, mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses')
const applyPackagedFuses = require('../client/build/after-pack.cjs')

async function main() {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'kokomovie-fuses-'))
  const executable = join(temporaryDirectory, 'KokoMovie.exe')
  try {
    await copyFile(require('electron'), executable)
    await applyPackagedFuses({
      appOutDir: temporaryDirectory,
      electronPlatformName: 'win32',
      packager: { appInfo: { productFilename: 'KokoMovie' }, executableName: 'kokomovie' },
    })
    const wire = await getCurrentFuseWire(executable)
    for (const option of [
      FuseV1Options.RunAsNode,
      FuseV1Options.EnableNodeOptionsEnvironmentVariable,
      FuseV1Options.EnableNodeCliInspectArguments,
    ]) {
      if (wire[option] !== 48) throw new Error(`Fuse ${FuseV1Options[option]} was not disabled`)
    }
    process.stdout.write('Electron production fuses verified on the installed runtime.\n')
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
