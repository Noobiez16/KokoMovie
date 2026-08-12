const { app } = require('electron')
const { resolve } = require('node:path')

const smokeProfile = process.env.KOKOMOVIE_SMOKE_PROFILE
if (!smokeProfile) throw new Error('KOKOMOVIE_SMOKE_PROFILE is required')

app.setPath('userData', smokeProfile)
if (process.env.KOKOMOVIE_SMOKE_DISABLE_GPU === '1') app.disableHardwareAcceleration()

require(resolve(__dirname, '../client/dist-electron/index.js'))
