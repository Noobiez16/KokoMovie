import { app, ipcMain } from 'electron'
import keytar from 'keytar'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import {
  localAccountSchema,
  tmdbCredentialSchema,
  trustedIpcHandler,
} from './security'

const SERVICE = 'kokomovie-pc'
export async function getTmdbCredential(): Promise<string | null> {
  const accountKey = 'tmdb-key-local'
  const stored = await keytar.getPassword(SERVICE, accountKey)
  return stored ?? migrateLegacyTmdbCredential(accountKey)
}

export async function storeTmdbCredential(credential: string): Promise<void> {
  await keytar.setPassword(SERVICE, 'tmdb-key-local', tmdbCredentialSchema.parse(credential))
}


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

// The migration above only runs when the keychain lookup misses. Installations that already had a
// keychain entry therefore kept auth-tokens.json on disk forever — holding a plaintext TMDB key
// plus dead access/refresh tokens from the removed account system. This runs unconditionally at
// startup: it rescues any credential the keychain is missing, then deletes the file. The file is
// only unlinked once every credential it holds is known to be in the keychain, so no key is lost.
export async function purgeLegacyCredentialFile(): Promise<void> {
  const path = legacyTokenPath()
  if (!existsSync(path)) return

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>

    for (const [key, value] of Object.entries(parsed)) {
      if (!key.startsWith('tmdb-key-')) continue // access/refresh tokens are dead; drop them
      const credential = tmdbCredentialSchema.safeParse(value)
      if (!credential.success) continue
      if (await keytar.getPassword(SERVICE, key)) continue
      await keytar.setPassword(SERVICE, key, credential.data)
    }

    unlinkSync(path)
    console.log('[auth] Removed the legacy plaintext credential file after keychain migration.')
  } catch {
    // Leave the file in place rather than risk discarding the only copy of a credential.
  }
}

// Access and refresh tokens from the removed account system are still sitting in the OS keychain
// on upgraded installations. They authenticate nothing now, so they are deleted. Only these two
// exact entries are touched; TMDB credentials are never removed here.
const DEAD_ACCOUNT_KEYS = ['access-token', 'refresh-token']

export async function purgeAccountEraKeychainEntries(): Promise<void> {
  for (const key of DEAD_ACCOUNT_KEYS) {
    try {
      if (await keytar.getPassword(SERVICE, key)) {
        await keytar.deletePassword(SERVICE, key)
        console.log(`[auth] Removed the obsolete "${key}" keychain entry from the former account system.`)
      }
    } catch {
      // A keychain that refuses access is not a startup failure.
    }
  }
}

export function registerAuthIpc(): void {
  ipcMain.handle('keychain:get-tmdb-key', trustedIpcHandler(async (_event, input: unknown) => {
    const accountId = localAccountSchema.parse(input)
    const accountKey = `tmdb-key-${accountId}`
    const stored = await keytar.getPassword(SERVICE, accountKey)
    return stored ?? migrateLegacyTmdbCredential(accountKey)
  }))

  ipcMain.handle('keychain:set-tmdb-key', trustedIpcHandler(async (_event, accountInput: unknown, credentialInput: unknown) => {
    const accountId = localAccountSchema.parse(accountInput)
    const accountKey = `tmdb-key-${accountId}`

    if (credentialInput === null || credentialInput === '') {
      await keytar.deletePassword(SERVICE, accountKey)
      return
    }

    const credential = tmdbCredentialSchema.parse(credentialInput)
    await keytar.setPassword(SERVICE, accountKey, credential)
  }))

  ipcMain.handle('keychain:clear-tmdb-key', trustedIpcHandler(async (_event, input: unknown) => {
    const accountId = localAccountSchema.parse(input)
    await keytar.deletePassword(SERVICE, `tmdb-key-${accountId}`)
  }))
}
