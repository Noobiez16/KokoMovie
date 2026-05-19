import { ipcMain } from 'electron'
import keytar from 'keytar'

const SERVICE = 'kokomovie-pc'
const ACCESS_TOKEN_ACCOUNT = 'access-token'
const REFRESH_TOKEN_ACCOUNT = 'refresh-token'

export function registerAuthIpc() {
  ipcMain.handle('keychain:get-token', () =>
    keytar.getPassword(SERVICE, ACCESS_TOKEN_ACCOUNT),
  )

  ipcMain.handle('keychain:set-token', (_event, token: string) =>
    keytar.setPassword(SERVICE, ACCESS_TOKEN_ACCOUNT, token),
  )

  ipcMain.handle('keychain:clear-token', () =>
    keytar.deletePassword(SERVICE, ACCESS_TOKEN_ACCOUNT),
  )

  ipcMain.handle('keychain:get-refresh-token', () =>
    keytar.getPassword(SERVICE, REFRESH_TOKEN_ACCOUNT),
  )

  ipcMain.handle('keychain:set-refresh-token', (_event, token: string) =>
    keytar.setPassword(SERVICE, REFRESH_TOKEN_ACCOUNT, token),
  )
}
