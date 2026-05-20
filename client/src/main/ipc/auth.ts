import { ipcMain, app } from 'electron'
import keytar from 'keytar'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync } from 'fs'

const SERVICE = 'kokomovie-pc'
const ACCESS_TOKEN_ACCOUNT = 'access-token'
const REFRESH_TOKEN_ACCOUNT = 'refresh-token'

function getFallbackPath() {
  return join(app.getPath('userData'), 'auth-tokens.json')
}

function getFallbackTokens(): Record<string, string> {
  try {
    const path = getFallbackPath()
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'))
    }
  } catch {}
  return {}
}

function setFallbackToken(key: string, val: string | null) {
  try {
    const path = getFallbackPath()
    const tokens = getFallbackTokens()
    if (val === null || val === '') {
      delete tokens[key]
    } else {
      tokens[key] = val
    }
    writeFileSync(path, JSON.stringify(tokens, null, 2), 'utf8')
  } catch {}
}

let tempRefreshToken: string | null = null

export function registerAuthIpc() {
  ipcMain.handle('keychain:get-token', async () => {
    try {
      const val = await keytar.getPassword(SERVICE, ACCESS_TOKEN_ACCOUNT)
      if (val) return val
    } catch {}
    return getFallbackTokens()[ACCESS_TOKEN_ACCOUNT] || null
  })

  ipcMain.handle('keychain:set-token', async (_event, token: string) => {
    try {
      await keytar.setPassword(SERVICE, ACCESS_TOKEN_ACCOUNT, token)
    } catch {}
    setFallbackToken(ACCESS_TOKEN_ACCOUNT, token)
  })

  ipcMain.handle('keychain:clear-token', async () => {
    try {
      await keytar.deletePassword(SERVICE, ACCESS_TOKEN_ACCOUNT)
    } catch {}
    setFallbackToken(ACCESS_TOKEN_ACCOUNT, null)
  })

  ipcMain.handle('keychain:get-refresh-token', async () => {
    if (tempRefreshToken) return tempRefreshToken
    try {
      const val = await keytar.getPassword(SERVICE, REFRESH_TOKEN_ACCOUNT)
      if (val) return val
    } catch {}
    return getFallbackTokens()[REFRESH_TOKEN_ACCOUNT] || null
  })

  ipcMain.handle('keychain:set-refresh-token', async (_event, token: string, persist: boolean = true) => {
    if (!persist) {
      tempRefreshToken = token
      // Remove from persistent storage
      try {
        await keytar.deletePassword(SERVICE, REFRESH_TOKEN_ACCOUNT)
      } catch {}
      setFallbackToken(REFRESH_TOKEN_ACCOUNT, null)
      return
    }

    tempRefreshToken = null
    try {
      if (token === null || token === '') {
        await keytar.deletePassword(SERVICE, REFRESH_TOKEN_ACCOUNT)
      } else {
        await keytar.setPassword(SERVICE, REFRESH_TOKEN_ACCOUNT, token)
      }
    } catch {}
    setFallbackToken(REFRESH_TOKEN_ACCOUNT, token)
  })
}
