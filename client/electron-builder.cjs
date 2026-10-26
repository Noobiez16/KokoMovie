// The default local build uses the same configuration as that platform's release job.
// Keeping a fourth, divergent all-platform YAML caused signing/FFmpeg options to drift.
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const yaml = require('js-yaml')
const target = { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform]
if (!target) throw new Error(`Unsupported packaging platform: ${process.platform}`)
module.exports = yaml.load(readFileSync(join(__dirname, `electron-builder.${target}.yml`), 'utf8'))
