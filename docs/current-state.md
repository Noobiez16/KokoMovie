# KokoMovie Current State

**Audit date:** 2026-08-03
**Baseline:** v1.4.1 shipped; v1.5.1 development
**Rollback SHA:** dd44816b794fe01e35c5b964af6a3bae3bd2f607

## Runtime

The only live product is the Electron client in client/. The renderer uses React, HashRouter, TanStack Query, Zustand, hls.js, and a whitelisted contextBridge API. The main process owns SQLite, keychain access, providers, stream/torrent proxying, downloads, updater integration, Discord RPC, and external-window policy. Legacy services and infrastructure were archived on archive/pre-phase-2-legacy and removed from the active repository. npm run dev starts only the Electron client.

## Local persistence

The database is userData/kokomovie.db. Startup enables WAL and foreign keys. Tables:

- downloads: identity, content/episode metadata, status/progress/bytes, paths, expiry, error, and serialized headers. Indexed by content, status, and expiry.
- watchlist: content ID/type and added timestamp.
- playback_positions: content/episode key, type, position, duration, completion, update time. Indexed by update time.
- preferences: the singleton language, subtitle default, autoplay, and maturity rating record.

Additional userData files include provider-prefs.json, update-prefs.json, extraction.log, and a legacy auth-tokens.json fallback. TMDB credentials are stored by keytar under the local account ID.

## IPC boundary

preload.ts exposes narrow methods grouped by keychain, downloads, app/help/update, Discord, API proxy, local library, providers, and torrents. It does not expose ipcRenderer directly.

High-risk findings for later phases:

- api:request is a generic URL proxy and needs destination validation.
- Most handlers trust TypeScript-shaped arguments without runtime schemas or sender checks.
- Legacy auth/refresh-token methods remain exposed although the local app has no login.
- Provider stream-header registration accepts renderer-supplied URLs/headers.
- Filesystem/download inputs require consistent containment and filename validation.
- oauth:callback remains from the former account design and appears dead.

## Window and network security

The main window enables contextIsolation, disables nodeIntegration, enables sandbox and webSecurity, restricts navigation, and opens approved HTTPS links externally. CSP is present but broad for HTTPS connectivity/media and contains development allowances.

Extraction windows use isolated partitions, contextIsolation, and no Node integration. webSecurity is disabled by default for provider compatibility. This is a documented high-risk exception requiring provider parity tests before tightening. Provider pages, redirects, scripts, media CDNs, subtitles, torrent trackers, GitHub, TMDB, YouTube trailers, Discord, and loopback proxy servers comprise the network surface.

Local media services bind to loopback. The HLS/subtitle proxy and torrent server must remain unreachable from non-loopback interfaces.

## Offline behavior

Works without connectivity:

- application shell, navigation, Settings, and bundled changelog;
- SQLite records for watchlist, positions, preferences, and downloads;
- completed local-file playback when referenced files remain present;
- saving local playback progress.

Degrades or fails without connectivity:

- uncached browse/search/details and enrichment of local IDs;
- remote artwork;
- provider discovery, streaming, new downloads, torrent discovery;
- GitHub feedback checks/submission, updater checks, and Discord presence.

There is no durable TMDB metadata/artwork cache yet. A watchlist or Continue Watching row can disappear from the rendered list when enrichment cannot reach TMDB. The current no-key experience intentionally shows ApiKeyRequired; no seed catalog exists.

## Testing reality

Vitest and Playwright are configured. Phase 3 established a non-empty deterministic unit suite plus explicit lint and renderer/main typecheck gates. Broader IPC, SQLite, download, provider-failure, and packaged-app coverage remains required.

## Ranked risks

| Rank | Risk | Severity | Reason |
|---|---|---:|---|
| 1 | Hostile provider extraction window with webSecurity normally disabled | Critical | Remote pages execute in Electron-controlled Chromium and require careful isolation. |
| 2 | Generic API proxy without an explicit destination allowlist | High | Renderer-controlled URLs can broaden network/SSRF exposure. |
| 3 | IPC payloads lack systematic runtime validation/sender checks | High | TypeScript does not validate hostile runtime messages. |
| 4 | No client regression tests | High | Provider, download, persistence, and updater changes can silently regress. |
| 5 | Provider/CDN behavior is externally unstable | High | Source availability, anti-bot behavior, signed URLs, and formats change independently. |
| 6 | Download/path handling spans remote data and user-selected filesystem locations | High | Traversal, overwrite, cleanup, and partial-file loss need explicit tests. |
| 7 | No durable metadata/artwork cache | Medium | Local records render poorly or disappear offline. |
| 8 | Dependency audit reports high and critical findings | High | Phase 4 must classify production reachability and update safely without blanket breaking upgrades. |
| 9 | Unsigned/unnotarized platform releases | Medium | Trust prompts and update authenticity vary by platform. |
| 10 | Broad CSP and legacy auth/OAuth surface | Medium | Unneeded permissions/API surface weaken least privilege. |

## Phase 1 conclusion

The fully local architecture is real and builds successfully, but its principal risks are untested hostile-content boundaries, generic IPC/network capabilities, absent client tests, and offline metadata dependence. Later phases must preserve provider/download parity while narrowing those boundaries.
