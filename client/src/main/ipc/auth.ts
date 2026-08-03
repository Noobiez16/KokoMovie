import { app, ipcMain } from 'electron'
import keytar from 'keytar'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import {
  assertTrustedRenderer,
  localAccountSchema,
  tmdbCredentialSchema,
} from './security'

const SERVICE = 'kokomovie-pc'

function legacyTokenPath(): string {
  return join(app.getPath('userData'), 'auth-tokens.json')
}

async function migrateLegacyTmdbCredential(accountKey: string): Promise<string | null> {
  const path = legacyTokenPath()
  if (!existsSync(path)) return null

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const credential = tmdbCredentialSchema.safeParse(parsed[accountKey])
    if (!credential.success) return null

    await keytar.setPassword(SERVICE, accountKey, credential.data)
    unlinkSync(path)
    return credential.data
  } catch {
    return null
  }
}

export function registerAuthIpc(): void {
  ipcMain.handle('keychain:get-tmdb-key', async (event, input: unknown) => {
    assertTrustedRenderer(event)
    const accountId = localAccountSchema.parse(input)
    const accountKey = `tmdb-key-${accountId}`
    const stored = await keytar.getPassword(SERVICE, accountKey)
    return stored ?? migrateLegacyTmdbCredential(accountKey)
  })

  ipcMain.handle('keychain:set-tmdb-key', async (event, accountInput: unknown, credentialInput: unknown) => {
    assertTrustedRenderer(event)
    const accountId = localAccountSchema.parse(accountInput)
    const accountKey = `tmdb-key-${accountId}`

    if (credentialInput === null || credentialInput === '') {
      await keytar.deletePassword(SERVICE, accountKey)
      return
    }

    const credential = tmdbCredentialSchema.parse(credentialInput)
    await keytar.setPassword(SERVICE, accountKey, credential)
  })

  ipcMain.handle('keychain:clear-tmdb-key', async (event, input: unknown) => {
    assertTrustedRenderer(event)
    const accountId = localAccountSchema.parse(input)
    await keytar.deletePassword(SERVICE, `tmdb-key-${accountId}`)
  })
}
