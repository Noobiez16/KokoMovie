import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  apiProxyRequestSchema,
  appLocaleSchema,
  assertTrustedRenderer,
  booleanFlagSchema,
  contentIdSchema,
  discordActivitySchema,
  localAccountSchema,
  playbackPositionSchema,
  PublicIpcError,
  preferencesPatchSchema,
  setTrustedRendererWebContentsId,
  tmdbCredentialSchema,
  trustedIpcHandler,
  validateApiProxyUrl,
} from '../../main/ipc/security'
import { FIXTURE_BEARER_VALUE, FIXTURE_HEADER_VALUE, urlWithFixtureCredentials } from './security-test-fixtures'

function ipcEvent(senderId: number, frame: 'main' | 'child', url = 'file:///app/index.html') {
  const mainFrame = { url }
  return {
    sender: { id: senderId, getURL: () => url, mainFrame },
    senderFrame: frame === 'main' ? mainFrame : { url },
  }
}

describe('main-process security boundaries', () => {
  it('trusts only the registered main WebContents and its main frame', () => {
    setTrustedRendererWebContentsId(7, 'file:///app/index.html')

    expect(() => assertTrustedRenderer(ipcEvent(7, 'main') as never)).not.toThrow()
    expect(() => assertTrustedRenderer(ipcEvent(8, 'main') as never)).toThrow('Untrusted IPC sender')
    expect(() => assertTrustedRenderer(ipcEvent(7, 'child') as never)).toThrow('Untrusted IPC sender')
    expect(() => assertTrustedRenderer(ipcEvent(7, 'main', 'file:///tmp/hostile.html') as never)).toThrow('Untrusted IPC sender')

    setTrustedRendererWebContentsId(null)
    expect(() => assertTrustedRenderer(ipcEvent(7, 'main') as never)).toThrow('Untrusted IPC sender')
  })

  it('applies the trust check before invoking a handler', () => {
    setTrustedRendererWebContentsId(11, 'file:///app/index.html')
    const handler = trustedIpcHandler((_event, value: string) => value.toUpperCase())

    expect(handler(ipcEvent(11, 'main') as never, 'safe')).toBe('SAFE')
    expect(() => handler(ipcEvent(12, 'main') as never, 'unsafe')).toThrow('Untrusted IPC sender')
    setTrustedRendererWebContentsId(null)
  })

  it('normalizes handler failures without exposing internal details', async () => {
    setTrustedRendererWebContentsId(13, 'file:///app/index.html')
    const event = ipcEvent(13, 'main') as never
    const syncHandler = trustedIpcHandler(() => {
      throw new Error('request failed with credential super-secret-value')
    })
    const asyncHandler = trustedIpcHandler(async () => {
      throw new Error('upstream response contained super-secret-value')
    })

    expect(() => syncHandler(event)).toThrow('IPC request failed')
    expect(() => syncHandler(event)).not.toThrow('super-secret-value')
    await expect(asyncHandler(event)).rejects.toThrow('IPC request failed')
    await expect(asyncHandler(event)).rejects.not.toThrow('super-secret-value')
    setTrustedRendererWebContentsId(null)
  })

  it('preserves explicitly public error codes for localized renderer copy', () => {
    setTrustedRendererWebContentsId(14, 'file:///app/index.html')
    const handler = trustedIpcHandler(() => {
      throw new PublicIpcError('DOWNLOAD_UNSUPPORTED_DRM')
    })
    expect(() => handler(ipcEvent(14, 'main') as never)).toThrow('DOWNLOAD_UNSUPPORTED_DRM')
    setTrustedRendererWebContentsId(null)
  })

  it('allows only measured HTTPS API destinations', () => {
    expect(validateApiProxyUrl('https://api.github.com/repos/a/b/issues').hostname).toBe('api.github.com')
    for (const url of ['https://api.themoviedb.org/3/movie/1', 'http://api.themoviedb.org/3/movie/1', 'https://example.com/', 'https://api.themoviedb.org.evil.example/', urlWithFixtureCredentials('api.github.com'), 'https://api.github.com:444/']) {
      expect(() => validateApiProxyUrl(url)).toThrow('API destination is not allowed')
    }
  })

  it('rejects expanded proxy capabilities', () => {
    expect(apiProxyRequestSchema.parse({ url: 'https://api.themoviedb.org/3/movie/1', method: 'GET', headers: { Authorization: FIXTURE_BEARER_VALUE, Accept: 'application/json' } }).method).toBe('GET')
    expect(() => apiProxyRequestSchema.parse({ url: 'https://api.themoviedb.org/3/movie/1', method: 'POST', headers: {} })).toThrow()
    expect(() => apiProxyRequestSchema.parse({ url: 'https://api.themoviedb.org/3/movie/1', method: 'GET', headers: { Cookie: FIXTURE_HEADER_VALUE } })).toThrow()
    expect(() => apiProxyRequestSchema.parse({ url: 'https://api.themoviedb.org/3/movie/1', method: 'GET', headers: {}, body: 'unexpected' })).toThrow()
  })

  it('limits credentials to the local identity and bounded values', () => {
    expect(localAccountSchema.parse('local')).toBe('local')
    expect(() => localAccountSchema.parse('another-account')).toThrow()
    expect(tmdbCredentialSchema.parse('12345678')).toBe('12345678')
    expect(() => tmdbCredentialSchema.parse('short')).toThrow()
  })

  it('bounds library positions and preference patches', () => {
    expect(contentIdSchema.parse('tmdb:movie:603')).toBe('tmdb:movie:603')
    expect(() => contentIdSchema.parse('x'.repeat(201))).toThrow()
    expect(playbackPositionSchema.parse({
      contentId: 'tmdb:movie:603',
      contentType: 'movie',
      positionSeconds: 120,
      durationSeconds: 300,
    })).toMatchObject({ positionSeconds: 120, durationSeconds: 300 })
    expect(() => playbackPositionSchema.parse({
      contentId: 'tmdb:movie:603',
      contentType: 'movie',
      positionSeconds: -1,
      durationSeconds: Number.POSITIVE_INFINITY,
    })).toThrow()
    expect(preferencesPatchSchema.parse({
      language: 'es',
      autoplay: false,
      maturityRating: 'PG-13',
      sourceDiscoveryMode: 'complete',
    })).toMatchObject({ language: 'es', autoplay: false })
    expect(() => preferencesPatchSchema.parse({ maturityRating: 'NC-17' })).toThrow()
    expect(() => preferencesPatchSchema.parse({ autoplay: true, unexpected: true })).toThrow()
  })

  it('accepts only supported application locales at the privileged boundary', () => {
    expect(appLocaleSchema.parse('es-ES')).toBe('es-ES')
    expect(() => appLocaleSchema.parse('es-BO')).toThrow()
    expect(() => appLocaleSchema.parse({ locale: 'en-US' })).toThrow()
  })

  it('bounds updater flags and Discord activity', () => {
    expect(booleanFlagSchema.parse(false)).toBe(false)
    expect(() => booleanFlagSchema.parse('false')).toThrow()
    expect(discordActivitySchema.parse({
      title: 'Example Movie',
      episode: 'S1E2',
      startedAt: 1_700_000_000_000,
    })).toMatchObject({ title: 'Example Movie', episode: 'S1E2' })
    expect(discordActivitySchema.parse(null)).toBeNull()
    expect(() => discordActivitySchema.parse({ title: 'x'.repeat(129) })).toThrow()
    expect(() => discordActivitySchema.parse({ title: 'Movie', unexpected: true })).toThrow()
  })
})

describe('torrent streaming boundaries', () => {
  const torrent = readFileSync(resolve(process.cwd(), 'src/main/ipc/torrent.ts'), 'utf8')

  it('keeps media probes bodyless and stream cleanup response-scoped', () => {
    expect(torrent).toContain("req.method === 'HEAD'")
    expect(torrent).toContain("res.on('close', cleanup)")
    expect(torrent).not.toContain("req.on('close'")
    expect(torrent).not.toContain('activeFF')
  })

  it('exposes one clean language and quality per torrent source', () => {
    expect(torrent).toContain("providerName: 'Torrent - ' + language + '-' + quality")
    expect(torrent).toContain('audioLangs: [lang]')
    expect(torrent).toContain('x.km-file')
    expect(torrent).toContain('TRACKERS.slice(0, 12)')
    expect(torrent).toContain('if (seenCount >= 4) continue')
    expect(torrent).not.toContain('reported seeders')
  })

  // A seeked remux reads the on-disk torrent file, so ffmpeg must never outrun the download that
  // fills it — 1.5x drained the priming cushion and hit sparse bytes minutes later ("Stream Error").
  it('paces a seeked remux at real time behind a large priming window', () => {
    expect(torrent).toContain("'-readrate_initial_burst', '8', '-readrate', '1.0'")
    expect(torrent).not.toContain("'-readrate', '1.5'")
    expect(torrent).toContain('256 * 1024 * 1024')
    expect(torrent).toContain('24 * 1024 * 1024')
  })

  // FFmpeg 8 rejects a language map that isn't marked optional, so the `:?` suffix must survive.
  it('keeps the optional audio language mapping', () => {
    expect(torrent).toContain('0:a:m:language:${tag}:?')
    expect(torrent).toContain("'-disposition:a:0', 'default'")
  })

  // Torrentio's language flags describe the release and frequently come from its SUBTITLE tracks,
  // so a "Spanish" BluRay rip can be English-only audio. The resolver must verify against the file.
  it('verifies the advertised dub against the file real audio streams', () => {
    expect(torrent).toContain('function probeAudioTracks(')
    // Only audio counts — a Spanish SUBTITLE track must never be read as a Spanish dub.
    expect(torrent).toContain(': Audio:')
    expect(torrent).toContain('probedTracks.find((track) => track.lang === requestedLang)')
    expect(torrent).toContain("if (audioStreamIndex !== null) return ['-map', '0:v:0?', '-map', `0:${audioStreamIndex}`]")
    expect(torrent).toContain('return { url, transcoded, audioLang: effectiveLang, requestedLang, audioLangs: probedLangs }')
  })

  it('does not claim a dub when the real audio tracks cannot verify it', () => {
    expect(torrent).toContain('const timer = setTimeout(() => finish([]), timeoutMs)')
    expect(torrent).toContain("ff.on('error', () => finish([]))")
    expect(torrent).toContain("throw new Error('Release does not contain verified '")
  })

  it('remuxes natively playable torrent containers when selecting a verified dub', () => {
    expect(torrent).toContain('const direct = PLAYABLE_EXT.test(name) && audioStreamIndex === null')
    expect(torrent).toContain('const transcoded = !PLAYABLE_EXT.test(name) || selectedAudioStreamIndex !== null')
  })
})

describe('outbound provider requests', () => {
  const providers = readFileSync(resolve(process.cwd(), 'src/main/ipc/providers.ts'), 'utf8')

  // http.Agent and https.Agent are distinct types: a shared RequestOptions holding a ternary of the
  // two widens to an `Agent | Agent` union neither request signature accepts. Each protocol branch
  // must attach its own agent instead.
  it('binds the keep-alive agent inside the matching protocol branch', () => {
    expect(providers).not.toContain('isHttps ? nodeHttpsAgent : nodeHttpAgent')
    expect(providers).toContain('agent: nodeHttpsAgent')
    expect(providers).toContain('agent: nodeHttpAgent')
  })

  it('rejects codec-labelled HEVC direct videos before they can win the provider race', () => {
    expect(providers).toContain("logExtraction('Rejected HEVC/H.265 direct video: '")
    expect(providers).toContain('(?:h\\.?265|hevc|x265)')
  })
})

describe('torrent player audio labelling', () => {
  const player = readFileSync(resolve(process.cwd(), 'src/renderer/components/player/VideoPlayer.tsx'), 'utf8')

  // A progressive torrent MP4 has no HLS renditions, so nothing publishes its audio language —
  // the menu kept showing the previous source's "English" while Spanish audio played.
  it('publishes the resolved dub as the progressive stream sole audio track', () => {
    expect(player).toContain('const publishTorrentAudioTrack = (lang: string) => {')
    expect(player).toContain("setAudioTracks([{ id: -1, name: getCleanAudioName('', lang), lang }])")
    // The label follows what is genuinely audible, never merely what was requested.
    expect(player).toContain('const playingLang = res.audioLang || wantLang')
    expect(player).toContain('publishTorrentAudioTrack(playingLang)')
    expect(player).toContain('publishTorrentAudioTrack(res.audioLang || norm)')
    // A language hunt moves on when a release only advertised the dub it does not carry.
    expect(player).toContain('if (res.audioLang && res.audioLang !== norm) {')
    // A non-torrent source still gets its real rendition list back from hls.js.
    expect(player).toContain('const resetAudioForNonTorrentSource = () => {')
    expect(player).toContain('hls.on(Hls.Events.AUDIO_TRACKS_UPDATED')
  })

  // A release that declares exactly one language wins over a stale cross-source language ref,
  // otherwise picking "Torrent - Spanish-1080P" remuxed English.
  it('lets a single-language release outrank a stale remembered language', () => {
    expect(player).toContain("const declaredLang = (stream.audioLangs?.length ?? 0) === 1 ? normalizeLang(stream.audioLangs![0]!) : ''")
    expect(player).toContain('const wantLang = declaredLang || currentAudioLangRef.current')
  })
})

describe('torrent seek and source-switch boundaries', () => {
  const player = readFileSync(resolve(process.cwd(), 'src/renderer/components/player/VideoPlayer.tsx'), 'utf8')
  const controls = readFileSync(resolve(process.cwd(), 'src/renderer/components/player/PlayerControls.tsx'), 'utf8')

  // The stream server may hold a seek request for up to 90s while it downloads the forward window.
  // The generic watchdogs judge a source dead after 20-25s, so they must stand down for that state.
  it('suspends the generic watchdogs while a torrent seek is in flight', () => {
    expect(player).toContain('const [torrentSeeking, setTorrentSeeking] = useState(false)')
    expect(player).toContain('if (torrentSeeking) return')
    expect(player).toContain('if (torrentSeekingRef.current) {')
    expect(player).toContain('}, [initialLoading, isBuffering, switchingSource, torrentSeeking, activeStreamUrl])')
  })

  // The grace window must end on success AND on failure, or the watchdogs stay disarmed forever.
  it('clears the seek grace window on canplay, playing, and media error', () => {
    expect(player).toContain('const onCanPlay = () => { clearBuffering(); setTorrentSeeking(false) }')
    expect(player).toContain('const onMediaError = () => setTorrentSeeking(false)')
    expect(player).toContain("video.addEventListener('error', onMediaError)")
    expect(player).toContain("video.removeEventListener('error', onMediaError)")
  })

  // A torrent is only ever an explicit user choice; generic embed fallback must never take it over.
  it('keeps generic embed fallback away from an explicitly chosen torrent', () => {
    expect(player).toContain("if (torrentStreamRef.current || activeSourceId?.startsWith('p2p-')) {")
  })

  it('exposes built-in torrents through Audio rather than the Source menu', () => {
    expect(player).toContain(".filter((s) => !s.providerId.startsWith('p2p-')")
    expect(player).toContain("availableSourceIds={allStreams.filter((s) => !s.providerId.startsWith('p2p-')).map((s) => s.providerId)}")
  })

  // Resolving a replacement can take tens of seconds; the outgoing stream must not keep playing.
  it('pauses the outgoing source before resolving a replacement', () => {
    expect(player.match(/try \{ videoRef\.current\?\.pause\(\) \} catch/g) ?? []).toHaveLength(2)
  })

  // A seek reload or buffering recovery flips isPlaying false -> true; auto-closing on that made
  // the settings panel slam shut moments after the gear was clicked.
  it('never auto-closes the settings panel on a playback resume', () => {
    expect(controls).not.toContain('wasPlayingRef')
    expect(controls).toContain('e.stopPropagation()')
  })
})

describe('Electron window hardening', () => {
  const main = readFileSync(resolve(process.cwd(), 'src/main/index.ts'), 'utf8')
  const extractor = readFileSync(resolve(process.cwd(), 'src/main/stream-extractor/index.ts'), 'utf8')

  it('keeps the primary window isolated and sandboxed', () => {
    for (const setting of ['contextIsolation: true', 'nodeIntegration: false', 'sandbox: true', 'webSecurity: true', 'webviewTag: false', 'allowRunningInsecureContent: false']) expect(main).toContain(setting)
  })

  it('isolates extraction and denies permissions, popups, and downloads', () => {
    for (const setting of ['contextIsolation: true', 'nodeIntegration: false', 'sandbox: true', 'setPermissionRequestHandler', "return { action: 'deny' }", "providerSession.on('will-download'"]) expect(extractor).toContain(setting)
  })
})
