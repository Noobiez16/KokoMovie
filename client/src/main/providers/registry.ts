import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { Provider } from './interface.js'
import { vidsrcProvider, vidsrcMeProvider } from './vidsrc.js'
import { twoEmbedProvider } from './2embed.js'
import { superEmbedProvider } from './superembed.js'
import { embedSuProvider } from './embedsu.js'
import { autoEmbedProvider } from './autoembed.js'
import { smashyStreamProvider } from './smashystream.js'
import { vidBingeProvider } from './vidbinge.js'
import { moviesApiProvider } from './moviesapi.js'
import { vidlinkProvider } from './vidlink.js'
import { vidsrcccProvider } from './vidsrccc.js'
import { multiembedProvider } from './multiembed.js'
import { vidsrcProProvider } from './vidsrcpro.js'
import { vidsrcRipProvider } from './vidsrcrip.js'
import { vidsrcSuProvider } from './vidsrcsu.js'
import { vidsrcPmProvider } from './vidsrcpm.js'
import { vidsrcInProvider } from './vidsrcin.js'
import { vixsrcProvider } from './vixsrc.js'
import { indraProvider } from './indra.js'

const ALL_PROVIDERS: Provider[] = [
  vidBingeProvider,
  vidsrcProvider,
  vidsrcSuProvider,
  vidsrcPmProvider,
  vidsrcInProvider,
  vidlinkProvider,
  // VixSrc carries multi-audio HLS masters → real dub tracks surface in the player's Audio
  // menu when a title has them. Placed mid-pack (proven enough, but not displacing the
  // top-tier racers) per DN-005's reliability ordering.
  vixsrcProvider,
  vidsrcccProvider,
  multiembedProvider,
  vidsrcProProvider,
  vidsrcRipProvider,
  autoEmbedProvider,
  superEmbedProvider,
  vidsrcMeProvider,
  twoEmbedProvider,
  smashyStreamProvider,
  moviesApiProvider,
  embedSuProvider,
  // Experimental multi-audio source (off by default — see indra.ts / DN-017).
  indraProvider,
]

interface ProviderPrefs {
  [id: string]: { enabled: boolean }
}

function prefsPath(): string {
  return join(app.getPath('userData'), 'provider-prefs.json')
}

function loadPrefs(): ProviderPrefs {
  try {
    if (existsSync(prefsPath())) {
      return JSON.parse(readFileSync(prefsPath(), 'utf8')) as ProviderPrefs
    }
  } catch { /* use defaults */ }
  return {}
}

function savePrefs(prefs: ProviderPrefs): void {
  const path = prefsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(prefs, null, 2), 'utf8')
}

export function listProviders(): Array<{ id: string; name: string; enabled: boolean }> {
  const prefs = loadPrefs()
  return ALL_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    enabled: prefs[p.id]?.enabled ?? (p.defaultEnabled ?? true),
  }))
}

export function getEnabledProviders(): Provider[] {
  const prefs = loadPrefs()
  return ALL_PROVIDERS.filter((p) => prefs[p.id]?.enabled ?? (p.defaultEnabled ?? true))
}

export function toggleProvider(id: string, enabled: boolean): void {
  const prefs = loadPrefs()
  prefs[id] = { enabled }
  savePrefs(prefs)
}

export function getProvider(id: string): Provider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id)
}
