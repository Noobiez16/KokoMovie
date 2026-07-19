import { ipcMain } from 'electron'
import DiscordRPC from 'discord-rpc'

type ActivityInput = { title: string; episode?: string; startedAt?: number } | null

let rpc: DiscordRPC.Client | null = null
let ready = false
let pendingActivity: ActivityInput = null

function applyActivity(activity: ActivityInput): void {
  pendingActivity = activity
  if (!rpc || !ready) return
  if (!activity) {
    rpc.clearActivity().catch(() => {})
    return
  }
  rpc.setActivity({
    details: activity.title.slice(0, 128),
    state: (activity.episode ? `Watching ${activity.episode}` : 'Watching a movie').slice(0, 128),
    startTimestamp: activity.startedAt ? new Date(activity.startedAt) : new Date(),
    instance: false,
  }).catch(() => {})
}

export function registerDiscordPresence(): void {
  const clientId = process.env['KOKOMOVIE_DISCORD_CLIENT_ID']?.trim() || '1512538334407295057'
  ipcMain.handle('discord:set-activity', (_event, activity: ActivityInput) => {
    if (!clientId) return { ok: false, reason: 'KOKOMOVIE_DISCORD_CLIENT_ID is not configured' }
    applyActivity(activity)
    return { ok: true }
  })
  if (!clientId) {
    console.info('[discord] Rich Presence disabled: set KOKOMOVIE_DISCORD_CLIENT_ID to a Discord application ID')
    return
  }
  rpc = new DiscordRPC.Client({ transport: 'ipc' })
  rpc.on('ready', () => { ready = true; applyActivity(pendingActivity) })
  rpc.on('disconnected', () => { ready = false })
  rpc.login({ clientId }).catch((error: Error) => {
    ready = false
    console.info(`[discord] Rich Presence unavailable: ${error.message}`)
  })
}

export function destroyDiscordPresence(): void {
  ready = false
  rpc?.destroy().catch(() => {})
  rpc = null
}
