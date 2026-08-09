# KokoMovie Current State

**Audit date:** 2026-08-08
**Baseline:** v1.5.2 optimization branch based on tagged v1.5.1
**Rollback SHA:** b35f87615fa0bc49f197902c3f501b6be7433797

## Runtime

The only live product is the Electron client in client/. The renderer uses React, HashRouter, TanStack Query, Zustand, hls.js, and a whitelisted contextBridge API. The main process owns SQLite, keychain access, providers, stream/torrent proxying, downloads, updater integration, Discord RPC, and external-window policy. Legacy services and infrastructure were archived on archive/pre-phase-2-legacy and removed from the active repository. npm run dev starts only the Electron client.

## Local persistence

The database is userData/kokomovie.db. Startup enables WAL and foreign keys. Tables:

- downloads: identity, content/episode metadata, status/progress/bytes, paths, expiry, error, and serialized headers. Indexed by content, status, and expiry.
- watchlist: content ID/type and added timestamp.
- playback_positions: content/episode key, type, position, duration, completion, update time. Indexed by update time.
- preferences: the singleton language, subtitle default, autoplay, and maturity rating record.
- tmdb_cache: schema-versioned structured TMDB response JSON with request keys, fetch time, and 90-day retention.

Additional userData files include provider-prefs.json, update-prefs.json, extraction.log, versioned catalog artwork, and download media sidecars. TMDB credentials are stored only by keytar under the local account ID; a legacy plaintext credential is migrated once and deleted after a successful keychain write.

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

Phase 5 adds a 90-day versioned TMDB response cache and constrained catalog-cache artwork protocol. Fresh cache renders immediately and refreshes in the background; stale cache, local search, downloaded metadata, watchlist, and Continue Watching remain usable when TMDB is unreachable. Completed MP4 downloads carry JSON, artwork, and available WebVTT subtitle sidecars. The no-key experience still intentionally shows ApiKeyRequired; no seed catalog exists.

## Provider and download resilience

Phase 6 keeps all bundled providers as the rollback/reference set. Main-process contracts validate renderer requests and each provider's declared HTTPS embed host. Extraction remains bounded and cancellable; infrastructure failures feed an in-memory circuit breaker and diagnostics are centrally redacted. The stream proxy binds to loopback and rejects private-network, local, credentialed, non-HTTP, and undeclared redirect targets.

Phase 7 validates download IPC payloads and transfer targets, persists the full download lifecycle, and offers Pause/Resume only for segment-based HLS jobs that can recover safely. Startup creates a dated SQLite backup before reconciliation, requeues interrupted transfers, validates/decrypts the contiguous saved HLS prefix, and migrates legacy v1.4.1 segment caches before starting the queue. Orphan detection is report-only and limited to KokoMovie's app-owned directory; user-selected folders are never scanned or altered.

## Local library portability

Settings can manually export and import the schema-v1 `kokomovie-library` JSON format. It contains watchlist, playback positions/history, preferences, and optionally up to 256 validated cached artwork files within a 50 MiB raw-data budget. TMDB credentials, provider secrets, download media, and absolute media paths are never exported.

Import is two-stage: main-process validation produces a count/conflict preview and short-lived token; the user then explicitly chooses Merge or Replace. Merge applies only newer timestamped watchlist/position records, while Replace clears those two tables before importing. Imported preferences are explicit incoming state in either mode. SQLite is backed up before the transaction; optional artwork is restored only after filename, size, and magic-byte validation. No sync service or account exists.

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

## Phase 9 — UX, Accessibility, Performance, and Diagnostics

The live application now uses one local identity throughout; account, sign-in, profile-switching, and avatar controls are absent from active routes. Provider controls expose native switch semantics, loading states announce progress, focus indicators remain visible for keyboard users, and the global stylesheet honors `prefers-reduced-motion`.

Operational diagnostics are local, rotating, size-bounded, and redacted at write time. The manual Settings workflow builds an allowlisted aggregate report that excludes credentials, content/watch details, provider URLs and headers, and filesystem paths; the complete JSON is shown for review before the native save dialog, and no report is transmitted automatically.

The Phase 9 production-build baseline is 418.56 kB (140.16 kB gzip) for the main renderer chunk, 575.85 kB (178.48 kB gzip) for the lazy player chunk, and 30.39 kB (8.79 kB gzip) for Settings. Existing catalog requests remain paged and cached; virtualization remains deferred until measurements demonstrate a need, avoiding a speculative interaction rewrite.

## Phase 10 — Release readiness

Release packaging is blocked on a shared quality job: locked install, lint, renderer/main typecheck, deterministic tests, production audit policy, and production build. Tag publication verifies that the tag equals the package version, requires Windows plus Linux x64/ARM64 installers and blockmaps, validates `latest-linux.yml` against x64 and `latest-linux-arm64.yml` against ARM64, and publishes `SHA256SUMS.txt`.

The updater architecture mapping is provided by electron-updater itself: x64 uses `latest-linux.yml`, while non-x64 Linux appends the process architecture (ARM64 uses `latest-linux-arm64.yml`). Windows continues to use `latest.yml`.

A fresh Linux x64 package gate produced the 1.5.1 AppImage (164.5 MB) and Debian (165.1 MB) artifacts on Electron 43.2.0 / electron-builder 26.15.7, verified the Electron executable, keychain, SQLite prebuild, and FFmpeg as x86-64, validated update metadata SHA-512 digests against the artifacts, and launched the unpacked packaged application successfully. The smoke check correctly refused a downgrade from local 1.5.1 to public 1.4.1, and the existing v1.4.1-era SQLite database opened cleanly under better-sqlite3 v13 with WAL intact and `integrity_check` reporting `ok`.

### Runtime and licensing

Electron 43.2.0 ships Chromium 150 and Node.js 24.18.0. The bundled FFmpeg is a checksum-pinned LGPL-3.0 build (FFmpeg 8.1, BtbN release `autobuild-2026-08-03-14-02`) installed at `resources/ffmpeg/` outside the asar archive with its license text and provenance record. KokoMovie itself is licensed GPL-3.0-or-later. `npm run check:licenses` gates all of this and currently reports 223 compatible production packages.

better-sqlite3 v13 distributes an ABI-stable N-API prebuild rather than a `build/Release/` artifact, so it no longer needs a per-Electron rebuild. CI native-binary verification was rewritten to name each shipped binary explicitly because the previous glob silently stopped covering both SQLite and FFmpeg.

### Defects found and fixed during the Phase 10 audit

Two items previously recorded as complete were not:

1. **Unbounded extraction log.** `stream-extractor` still appended to `extraction.log` with no size limit; a real installation held 57 MB of unredacted provider URLs. It now rotates at 2 MB across four generations and reclaims oversized logs inherited from earlier builds.
2. **Persistent plaintext credential file.** `auth-tokens.json` was only removed when the keychain lookup missed, so installations that already had a keychain entry kept a plaintext TMDB key and dead account-era JWTs on disk forever. It is now purged at every startup after confirming the keychain holds each credential, and the obsolete `access-token` / `refresh-token` keychain entries are deleted.

Both fixes are covered by `client/src/renderer/lib/local-data-hygiene.test.ts` and were verified at runtime against the packaged build.

### Remaining release gates

- Windows and Linux ARM64 clean install and upgrade have not been exercised on real hardware; only Linux x64 was packaged and launched locally.
- A genuine 1.4.1 → 1.5.1 updater upgrade has not been run. Only the inverse (downgrade refusal) is verified.
- Installers remain unsigned on Windows and Linux; macOS stays build-only and has no vendored LGPL FFmpeg.
- The production CSP still carries `'unsafe-inline'`, `'unsafe-eval'`, a bare `https:` in `frame-src`, and `http:` in `media-src`.
- Phases 5–10 are merged into `main` and tagged `v1.5.1` locally. The tag and merge have not been pushed, so no release is published and CI has not yet run the packaging gates against them.
