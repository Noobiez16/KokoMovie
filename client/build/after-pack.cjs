const path = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

function packagedExecutable(context) {
  const product = context.packager.appInfo.productFilename
  if (context.electronPlatformName === 'darwin') {
    return path.join(context.appOutDir, `${product}.app`, 'Contents', 'MacOS', product)
  }
  if (context.electronPlatformName === 'win32') {
    return path.join(context.appOutDir, `${product}.exe`)
  }
  return path.join(context.appOutDir, context.packager.executableName)
}

module.exports = async function hardenPackagedElectron(context) {
  await flipFuses(packagedExecutable(context), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
  })
}

module.exports.packagedExecutable = packagedExecutable
