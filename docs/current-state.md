# KokoMovie Current State

**Current review:** 2026-10-07
**Source target:** v2.0.0, branch `codex/kokomovie-v2-source-priority`, based on `7e1c219`.
**Recovery points:** `codex/kokomovie-v2-fullscreen-polish` remains at `7e1c219`; `codex/kokomovie-v2-inline-search` remains at `1cc797a`; `codex/kokomovie-v2-hbo-ui` remains at `2d9ec65`; `codex/kokomovie-v2-0-0` remains at `c465dbb`.
**Release status:** development source; no v2.0.0 installer published or installed by this work.

## Verified source priority and native typing

Automatic discovery ranks validated non-CAM sources by 2160p/4K, 1440p, 1080p, then
720p; known standard-release evidence breaks equal-resolution ties. Known CAM/TS remains
last resort with confirmation. Progressive discovery starts immediately for validated non-CAM
4K; otherwise it waits for enabled pending providers to finish or the existing 40-second deadline.
Complete Scan still waits for all attempts/deadline. This may increase initial waiting time for
lower tiers, giving late HD/UHD alternatives a chance to win. Manual choice and HLS AUTO
bandwidth adaptation remain intact; no quality variants or pixels are invented.

The HLS probe previously passed a localhost proxy URL to a helper that intentionally rejects
private targets, falling back to guessed 720p. It now reads validated public manifests with
source headers, redirects and DNS protections, a 2 MiB compressed/decompressed bound,
15-second elapsed timeout and cancellation. Dimensionless legitimate media remains Unknown
and usable as fallback; failed validation is rejected. Main nominal tiers now agree with the
renderer for 960x540, 1282x534 and 1920x800. Late responses cannot change finished searches.

Fresh lookups already re-extract in unique temporary sessions; no persistent CAM-selection
cache was found or added. Current playback/PiP deliberately retains its session. URL/manifest
release clues cannot visually identify an unlabelled CAM, and a streaming release date does
not guarantee a high-quality source in every enabled provider.

Strict checking now covers renderer, main and every native E2E source. The standard
`client/e2e/tsconfig.json` gives the editor the existing preload globals; installed TSserver
confirms the configured project and zero fullscreen diagnostics. Final functional gates passed:
662 units, 17 real Electron tests (40.3s), all TypeScript targets, lint 0 errors/0 warnings,
build and 227 production package/three FFmpeg licence checks. Version, logo and base palette
remain unchanged. See [testing](testing.md) for evidence and limits.

An isolated live repeat on 2026-10-07 at 21:35 UTC selected VidSrc.su for Spider-Man:
Brand New Day, with MoviesAPI also reporting 1080p and VixSrc reporting 720p. Actual
decoded frames were 1920x800 (cinematic nominal 1080p), unchanged in DOM fullscreen
with the same video and source. The release type was unknown, so this observation does
not certify WEB-DL or visual absence of CAM. This is one title/source/time, not universal
1080p/4K availability. The earlier VixSrc observation below remains historical evidence.

The current local Windows x64 verification package is
`client/.codex/package-windows-source-priority/win-unpacked`. Resource/native module,
FFmpeg, production CSP and executable-fuse checks pass; version stays 2.0.0. It is unsigned,
unpublished and not installed. No desktop shortcut was changed.

## Verified v2.0.0 interface

The desktop shell follows the approved five-screen HBO Max-inspired composition: a 76px
topbar without a separator, Home/Movies/Series, the original centered logo, Search and a Library/tools menu.
Compact windows move the primary links into that disclosure. Search expands left in the header,
showing up to eight real poster/title suggestions beneath the field after a 300ms debounce and
at least two characters. Typing keeps the current route; selecting opens details. Keyboard selection,
Escape focus, outside/Tab closure, Ctrl+K/Cmd+K and stale-response suppression are covered.
Dismissal contracts right over 160ms while the field/panel immediately become inactive.
Reopening cancels closure; reduced motion closes immediately. Empty or one-character input
has no panel or minimum-length instruction.
Legacy `/search` links retain their single page field, URL filters, pagination and history; the
redundant header control is omitted there. The shared
scroll area and single PlayerHost outside Routes are preserved. No login or profiles were added.

Home prioritizes one real Continue Watching row in 16:9 cards, followed by catalog rows.
Its former My List row and query are removed. A single My Library menu entry and shared
page heading join the existing history/list tabs; `/history?tab=list` remains valid and saved
records remain in the library. Movies/Series expose actual genre and trending destinations.
Integrated detail artwork, keyboard season tabs and independent episode play/download
buttons retain the existing source, resume and demand-loading workflows. Episodes form
four/three/two columns at 1440/1152/1024px. Without a featured hero, content keeps the header
space so local library rows and genre controls remain accessible.

Hero/detail artwork contains the complete image with a feathered transition to the existing
background. Fluid height replaces the 620px hero ceiling and allows copy/actions to grow.
Only hero/detail trusted w1280 artwork upgrades to original when contained size and density
require it, with cached w1280 fallback. Original image requests retain fixed-host/path validation,
15 MiB limits and timeout. Native layout checks cover 3840x2160, 3440x1440 and 1024x768.
Measured monitors are 3440x1440 and 1440x2560, both at scale 1.

Quality exposes actual HLS variants and AUTO; 720p/1080p missing from a source are disabled.
Direct video reports its measured nominal tier and cannot change encoded resolution. Intrinsic
metadata/resize events update that measurement; real source changes clear old variant data.
Fullscreen retains the video, URL, decoded pixels and quality intent. Real generated 720p/1080p
files passed DOM and native-window fullscreen checks. One isolated live Spider-Man: Brand New Day
probe selected VixSrc: 1282x534 cinematic frames (nominal 720p) remained identical during fullscreen.
That observation applies to the tested source and time, not every provider or the user's selected source.

Compiled Electron checks verify card zoom, menu entry, 200ms valid Search/season entry and
reduced motion without displacement or loss of focus. These are KokoMovie motion values;
exact HBO Max macOS timings were not verified. The Behance reference is an unofficial static
concept, limited to Wireframe, Home, Series Selected, Search and Movies Featured.
Library import/export retains its Settings tab and all existing operational APIs.

Movie hero Play enters source discovery through approved content details rather than
opening an empty player. Series opens episode selection. Search uses complete typed
TMDB endpoints, preserves filters/pagination through navigation, and normalizes synthesized
offline matches to page 1. Catalog failures expose actual query retries.

The logo SHA-256 remains `EE5C1EF3359A6E459C92090623487664B2444F1B37AD4A75EA04D48A68608650`;
base palette values are unchanged. Locale persistence accepts both canonical and legacy
codes. Seventeen real Electron tests exercised isolated SQLite watchlist/resume, EN/ES/FR,
search/navigation, compiled layout/motion and privileged boundaries. See [testing](testing.md)
for limits. Dependencies and playback-provider contracts are unchanged; this block retires
specific availability endpoints and extends validated artwork sizing and player quality presentation.

The renderer entry checks for Electron's preload bridge before mounting App/PlayerHost.
A regular browser at the development URL now receives localized desktop guidance instead
of crashing on missing provider subscriptions. This is a desktop client, not a browser
backend: no credentials, database, source or playback APIs are exposed over HTTP.

The preceding core block repaired source/downloader contracts and callback redirects. Torrent
downloads require the actual IPv4 endpoint, live selected file and capability. Both accepted
hostnames were exercised through a real local HTTP server. Production audit now fails closed;
js-yaml 4.3.2 and ip-address 10.7.3 yielded a fresh report with zero findings. Weekly trending
collections preserve scope and pagination instead of treating trending as an unknown genre.

## Verified storage, security and first discovery addition

Per-download jobs serialize pause/resume, settle requests and FFmpeg children, and check
cancellation after asynchronous finalization/artwork. Portable publication and sidecars use
exclusive creation; rollback tracks owned files. Expiration claims only live unfinished
rows, preventing a stale cleanup snapshot from removing a newly completed download.
Completed files remain until explicit removal; unfinished work has the visible 30-day policy.

Torrent caches are allocated per torrent, registered by the main process and removed only
after consumers and filesystem stores close. Audio probes preserve successful EOF and are
retained until FFmpeg closes. Application quit awaits both download and P2P teardown.
Resolver lookup/allocation is serialized within four torrent slots. Routine eviction selects
only idle entries; active streams/processes, accepted queued downloads and a 60-second URL
handoff reservation protect their allocation. Failed language resolution cannot dispose a
shared torrent. When all slots are reserved, translated copy asks the user to wait or retry.
A buffered player after HTTP EOF and handoff expiry is idle; a later request may need fresh
resolution if its cache was evicted. No persistent player-session lease was added.

Production renderer scripts prohibit inline code and evaluation, with build-time file CSP
and blob media-worker support. Trusted-frame headers do not replace third-party policies.
Existing frame/media/network permissions remain broad for compatibility; this is targeted
script hardening, not a complete removal of third-party media risk.

Where to watch has been removed completely: UI/API, translations, country persistence and
specific country/watch-provider endpoints. Older km-settings payloads migrate to an empty
durable state while runtime keychain handling remains. Actual playback providers and regional
maturity certifications are preserved.

Final source checks passed: 616 deterministic tests, seventeen Electron tests (37.3s), both TypeScript
targets, zero-error/zero-warning lint, build and licenses (227 packages/three FFmpeg targets).
The preceding core block returned a zero-finding production audit; dependencies did not
change during this UI refinement. The native download test used a generated
H.264/AAC fixture and real FFmpeg; movie/episode outputs had different names and offline
video decoding, seek and play worked with HTTP blocked.

A Windows x64 unpacked package was prepared and inspected, including native resources,
version, fuses, file CSP and bundled FFmpeg. All 28 renderer assets match the tested build.
The package is at client/.codex/package-windows-fullscreen/win-unpacked; it is unsigned,
unpublished and not installed. Existing Vite/plugin deprecations, Node SQLite experimental
notice, player chunk size and packaging ASAR/duplicate-reference notices remain tooling debt.
Authenticode needs a signing identity; installed upgrades, Linux/macOS packaging and live
peer/provider endurance were not repeated here. Title alerts, personal collections,
history-based recommendations and a marathon planner remain future roadmap items.

## Historical architecture and phase notes

The remaining sections describe prior milestones and audit findings. They are historical;
the current verification above takes precedence over old baseline counts and risk status.

**Historical audit:** 2026-08-12, v1.5.4 source-discovery branch based on tagged v1.5.3.
**Historical rollback SHA:** b35f87615fa0bc49f197902c3f501b6be7433797

## Runtime

The only live product is the Electron client in client/. The renderer uses React, HashRouter, TanStack Query, Zustand, hls.js, and a whitelisted contextBridge API. The main process owns SQLite, keychain access, providers, stream/torrent proxying, downloads, updater integration, Discord RPC, and external-window policy. Legacy services and infrastructure were archived on archive/pre-phase-2-legacy and removed from the active repository. npm run dev starts only the Electron client.

## Local persistence

The database is userData/kokomovie.db. Startup enables WAL and foreign keys. Tables:

- downloads: identity, content/episode metadata, status/progress/bytes, paths, expiry, error, and serialized headers. Indexed by content, status, and expiry.
- watchlist: content ID/type and added timestamp.
- playback_positions: content/episode key, type, position, duration, completion, update time. Indexed by update time.
- preferences: the singleton language, subtitle default, autoplay, maturity rating, and source-discovery mode record.
- tmdb_cache: schema-versioned structured TMDB response JSON with request keys, fetch time, and 90-day retention.

Additional userData files include provider-prefs.json, update-prefs.json, extraction.log, versioned catalog artwork, and download media sidecars. TMDB credentials are stored only by keytar under the local account ID; a legacy plaintext credential is migrated once and deleted after a successful keychain write.

## Interface localization

The renderer bundles English (`en-US`), Spanish (`es-ES`), and French (`fr-FR`) resources through i18next/react-i18next. Startup hydrates the persisted preference before rendering, and Settings applies a new locale immediately across the React interface, HTML document locale, native Electron menu, and TMDB query cache. Locale-specific TMDB cache keys keep translated catalog responses isolated. The custom language listbox uses the application’s dark palette and supports keyboard and assistive-technology navigation. Portuguese is intentionally not exposed yet.

The native View menu always includes Toggle Developer Tools, including packaged builds, so users can inspect renderer console errors without a special development build.

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

The v1.5.4 discovery flow exposes every enabled provider with live search status and honest detected quality. Fast & Progressive is the default and continues filling the menu after playback begins; Complete Scan waits for every bounded provider attempt or 40 seconds. Automatic selection ranks known CAM/telesync sources last and warns before playing one. The local HLS proxy keeps incomplete-segment Range recovery and now follows the outgoing response lifecycle, avoiding false cancellation when Node closes a completed incoming request message.

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

Electron 43.4.1 ships Chromium 150 and Node.js 24.18.1. The bundled FFmpeg is a checksum-pinned LGPL-3.0 build (FFmpeg 8.1, BtbN release `autobuild-2026-07-31-14-10`) installed at `resources/ffmpeg/` outside the asar archive with its license text and provenance record. KokoMovie itself is licensed GPL-3.0-or-later. `npm run check:licenses` gates all of this and currently reports 227 compatible production packages.

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
