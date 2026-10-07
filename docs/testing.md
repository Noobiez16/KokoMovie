# Testing and Regression Baseline

**Current verification:** 2026-10-07, v2.0.0, `codex/kokomovie-v2-inline-search`.
Final source checks: 531 deterministic tests and fourteen real Electron tests passed;
both TypeScript targets, lint (zero errors/warnings), build and licenses passed.
The interface/core counts below record earlier completed blocks.

### Integrated search and library refinement

- Native RED reproduced the old 1px topbar separator; the compiled header now has no border.
  Home has one Continue Watching row with real SQLite positions and no saved-list row/query.
  One My Library entry and shared heading retain list/history tabs, deep links and saved records.
- Ten focused inline regressions cover 300ms debounce/minimum length, delayed responses,
  eight-result limit, keyboard detail identity, errors/retry/empty state, focus, shortcuts,
  same-page navigation/Back cleanup and locale/maturity refresh suppression. Menu/search
  overlap was reproduced RED and corrected with focus-preserving disclosure closure.
- Real Electron verifies no typing navigation, actual IPC-backed suggestions, an old delayed
  response arriving after the latest result, keyboard selection, Escape and outside focus.
  Captures and actual geometry at 1440/1024/960px show no overlap with brand/menu or viewport overflow.
  Chromium confirms the 260ms left-reveal input animation and its removal under reduced motion.
- Legacy `/search` links retain URL/type/page/Back and result-entry coverage. EN/ES/FR,
  SQLite library/resume persistence, no-hero spacing, privileged boundaries and real offline
  FFmpeg playback remain covered. Closed inline search performs no preference/catalog queries.
- Fresh final gate: 531 units, fourteen native tests (28.2s), both TypeScript targets,
  build and full lint with zero errors/warnings. No dependencies, main/IPC or player changes.
  Logo hash/base palette match the recovery source; all versions remain 2.0.0.
- The local Windows x64 unpacked package was regenerated with publication disabled.
  Version 2.0.0, resources, native modules, FFmpeg, production CSP and executable fuses
  passed inspection; its renderer bundle matches the tested source build and includes
  inline search. The unsigned package was not installed; the desktop shortcut remains unchanged.

The dedicated Search field and Home saved-list composition in the historical HBO block
below were superseded by the user's integrated-search/library refinement.

### Desktop runtime guidance

- Reproduced the development browser crash on missing `onStreamsCollected`. The entry
  now mounts App only when the preload bridge exists; otherwise it renders EN/ES/FR
  desktop guidance. The live development browser was reloaded and inspected successfully.
- Entry regressions verify both missing-bridge guidance and normal desktop mounting.
  A sandboxed native Chromium window with no preload verifies the compiled guidance;
  the existing real-app navigation, persistence, playback and security tests still pass.
- Final gate: 520 units, thirteen native tests, both TypeScript targets, zero-error/zero-warning
  lint and build passed. Main-process contracts and dependencies remain unchanged.

### HBO-inspired UI refinement

- Native tests retain SQLite, country persistence, URL search/type/page/Back, operational
  routes and EN/ES/FR. The header has a single Search link/input destination, accessible
  library disclosure, compact primary links and both Ctrl+K/Cmd+K focus.
- Home, Movies Featured, Search, movie detail, selected series and menu captures were
  inspected at 1440×900 and 1024×768 using synthetic artwork and isolated catalog records.
  Episode geometry also passes at 1152×820: four/three/two columns with 16:9 visuals.
  Keyboard season changes show the correct requested episodes.
- A native RED/GREEN case confirmed a no-hero Home heading at y=24 under the 76px header;
  the corrected Home library and Movies/Series genre controls reserve header space.
  Local records are explicitly seeded for this independent test.
- Chromium metrics verify hover scale approximately 1.035, menu entry 220ms, and valid
  Search/season entry 200ms. Same-route Search identity remounts without stale results.
  Reduced motion removes animations/zoom and retains arrow position, focus and actions.
  Representative resting/hover/menu/reduced screenshots form a local motion sequence.
- Focused regressions cover delayed season data and menu close/reopen, navigation and
  unmount timer cancellation. PlayerHost remains outside Routes; main/player/API and
  dependency files are unchanged from the prior verified checkpoint.
- Logo SHA-256 and palette match `c465dbb`; root/client/lock versions remain 2.0.0.
  License gate: 227 production packages and three LGPL FFmpeg targets. The prior core
  production audit was clean; no dependency change required an additional external audit.
- The final Windows x64 unpacked package was regenerated with `--publish never` and
  verified for version 2.0.0, production CSP, actual executable fuses, SQLite/keychain
  bindings, filesystem store and bundled FFmpeg. Authenticode is NotSigned; no installer
  or installed upgrade was executed.
- The reference is an unofficial static Behance concept. This verifies KokoMovie on
  Windows, not exact HBO Max macOS timings, live providers, peers or current availability.
  Existing Vite migration/deprecation, SQLite experimental and large-player-chunk warnings
  remain; lint itself reports zero warnings. One native resize request was lost in an
  intermediate run; the final full suite passed its actual-width assertions without a
  product change or weakening the checks.

### Initial v2.0.0 interface milestone (historical)

- 366 deterministic tests passed. Renderer/main TypeScript, lint (zero errors/warnings), and production build passed.
- Six real Electron tests passed on Windows: five privileged boundary tests and a desktop UI flow with isolated SQLite and credentials intercepted before application startup.
- UI flow covered detail navigation, typed paginated search, Back, query changes, watchlist/resume records, operational pages, EN/ES/FR persistence, compact navigation and Ctrl+K focus.
- Screenshots at 1440×900 and 1024×768 used synthetic catalog artwork. This verifies layout and interaction, not external provider availability or a packaged upgrade.
- License gate: 227 compatible production packages and three verified LGPL FFmpeg targets. Audit security findings remain a separate correction block.
- Logo hash and base CSS palette were compared with the pre-change source and are unchanged.

On this Windows sandbox, set TEMP/TMP to a project-local writable temporary folder before
Vitest/Playwright; the system temporary folder can reject Vitest artifact renames. The tests
do not need changes to product behavior for that environment limitation.

Historical baseline (2026-08-08): 113 Vitest tests on v1.5.2. Historical phase notes below
are retained and do not imply every live/manual scenario has been repeated for v2.0.0.

### v2.0.0 core correction block

- Full suite: 417 passed; six Electron tests passed again after dependency/source changes.
- Final IPv4 endpoint refinement: 25 targeted source/redirect tests passed, including rejection of IPv6 literals and real HTTP transfers via localhost and 127.0.0.1.
- Callback tests exercise invalid/private/prohibited redirects, late response errors, valid public redirects and same-origin sensitive-header isolation. They use synthetic fixtures rather than external providers or peers.
- Audit CLI tests cover malformed/operational/error reports, signal/spawn failures, exit/count consistency, and severity policy. The actual external production audit returned exit 0 with all vulnerability counts zero.
- Both TypeScript targets, zero-error/zero-warning lint, production build, license gate, and npm ci --dry-run passed. No installer signature, upgrade, live swarm or long-duration playback is implied.

### v2.0.0 storage, security and regional discovery

- Storage/security/discovery block: 471 passed; final ownership correction: 487 passed.
  Eight Electron tests passed again against the final built renderer/main.
- Download regressions execute real IPC handlers with SQLite and staging directories;
  controlled FFmpeg children cover blocked stdin, pause/resume ordering, artwork waits,
  cancellation/deletion, shutdown recovery, equal-title collisions, sidecar exclusivity,
  unrelated directory preservation and expiry racing a completed transfer.
- P2P tests include the installed fs-chunk-store and callback ordering. Audio probe tests
  distinguish normal EOF from interruption and retain the child until actual close.
- Resolver tests exercise the production acquisition boundary with deterministic torrent
  doubles: idle-only eviction, bounded all-busy rejection, same-torrent reuse, concurrent
  acquisition, shared failure preservation, handoff expiry and forced shutdown. Real
  download IPC/SQLite tests observe queued lease release on cancel/delete/expiry/shutdown,
  destination setup failure and successful media completion. They do not certify a live swarm.
- The native portable test generates H.264/AAC with bundled FFmpeg, downloads a movie and
  episode through a registered process-owned local fixture, checks distinct MP4/metadata
  outputs and removed staging, stops the origin, blocks HTTP and verifies offline Range,
  video decoding, seek and play in Electron. It does not join a torrent swarm.
- Native CSP checks inject an inline script, load an ordinary external local eval probe,
  and run a blob worker. DevTools evaluation alone bypasses CSP and is not the eval proof.
- Where to watch tests cover both media types, explicit country selection, grouping,
  saved/outdated notices, malformed response/link rejection, retry and title isolation.
  Native fixtures switch countries and verify preference persistence after reload.
- Fresh production audit returned zero info/low/moderate/high/critical findings.
  License check passed for 227 production packages and three FFmpeg targets.
- Windows x64 unpacked packaging completed with `--publish never`; version/resources,
  native modules, FFmpeg and production CSP were inspected. Actual executable fuses were
  read using `node scripts/verify-electron-fuses.cjs <path-to-KokoMovie.exe>`; the argument
  mode is read-only. Signing status was NotSigned. No installer/upgrade was executed.

Repeat native checks from `client` after `npm run build`, with TEMP/TMP under
`client/.codex/tmp`, using `node ../node_modules/@playwright/test/cli.js test`.
Live provider/swarm startup, long-duration seek/audio stability, installed upgrades and
other platform packages still need their own verification. Availability fixtures do not
establish today's regional service availability.
After HTTP EOF and the 60-second URL handoff reservation, a fully buffered player is idle;
eviction can require fresh resolution for a later media request. Active HTTP/process consumers
and accepted queued downloads are protected, without a renderer player-session lease.

## Existing commands

- npm run dev:client: Vite, main-process TypeScript watch, and Electron.
- npm run build: all workspace builds; currently the reliable gate.
- npm test: workspace tests if present.
- client npm test: Vitest; empty suites now fail.
- client npm run test:e2e: Playwright.
- npm run lint: root ESLint command; must be audited before treating as a gate.
- npm run audit:production: production advisory policy with no high/critical exceptions.
- npm run check:licenses: distribution licence gate; `-- --report` prints the inventory.
- npm run vendor:ffmpeg [targets]: fetches and verifies the pinned LGPL FFmpeg builds.

The packaging configurations are validated against the JSON schema electron-builder ships, in the unit suite, so an invalid or version-renamed key fails in the quality gate instead of after a packaging runner has already installed, built, and vendored. The suite also asserts that the specific key which broke the v1.5.1 Windows release is still rejected, so the check cannot silently weaken.

Phase 3 added deterministic TMDB and identity tests. Phase 5 adds cached-search/download reconstruction, offline byte-range, subtitle normalization, and progress reconciliation tests. Phases 6–7 add complete bundled-provider contracts, proxy network policy, download IPC schemas, lifecycle transitions, and partial-recovery policy coverage. Phase 8 adds strict portability schemas, merge ordering, content exclusion, and artwork signature coverage. Broader IPC, SQLite migration, extractor, and packaged-app suites remain planned.

## Mandatory manual regression matrix

1. Launch with no TMDB credential and verify ApiKeyRequired.
2. Validate/save both TMDB v3 key and v4 token forms.
3. Verify browse/trending, search, movie detail, TV detail, cast, seasons, and episodes.
4. Add/remove watchlist and verify persistence after restart.
5. Save/remove movie and episode positions; verify Continue Watching/history.
6. Start provider playback, manual source selection, automatic fallback, subtitles, PiP, and next episode.
7. Resolve a torrent, verify bounded startup, select an audio language, and seek.
8. Download a movie, episode, and series; verify progress, cancellation/error, folder action, and portable offline playback.
9. Verify Help → Changelog, feedback composition, and completion notification parsing.
10. Verify update disabled/enabled/manual-check/download/install states.
11. Inspect Windows, Linux x64, and Linux ARM64 artifacts and native binary architecture.

## v1.5.2 WebTorrent regression verification (2026-08-08)

- The real Electron preload IPC resolved WebTorrent's official Creative Commons Sintel torrent. A bodyless `HEAD` returned the correct media metadata and a `Range: bytes=0-1048575` request returned HTTP 206, a valid `Content-Range`, and exactly 1 MiB of media data.
- Live Torrentio discovery for a movie fixture returned only one-language 1080p labels such as `Torrent - English-1080P`, `Torrent - French-1080P`, and `Torrent - Portuguese-1080P`.
- Regression tests lock response-scoped stream cleanup, bodyless media probes, removal of the process-global FFmpeg terminator, and the clean source-label contract.

## v1.5.2 torrent audio and seek verification (2026-08-08)

Automated, on this machine:

- The bundled LGPL FFmpeg 8 binary was given the exact argument vector `serveTranscoded` builds for a seek, against a synthetic 120-second MKV carrying an English audio stream flagged `default` and a Spanish one that is not — the layout that produced the wrong dub. With Spanish requested, the output is video plus `a:0 (spa) (default)` followed by `a:1 (eng)` with its default flag cleared. With French requested (absent from the release), the `0:a:0?` fallback still yields a real audio stream. No FFmpeg diagnostics were emitted, so the optional `0:a:m:language:<tag>:?` mapping is accepted by this build.
- Pacing: seeking to 60 seconds with `-readrate_initial_burst 8 -readrate 1.0` produced 20.02 seconds of media in 14.0 seconds of wall time — the intended short burst followed by real-time reading. The previous `-readrate 1.5` setting would have been roughly 29 seconds ahead by the same point, which is what exhausted the priming cushion and produced the delayed Stream Error.
- Electron launched against the built main process on `DISPLAY=:1` and ran to the timeout with no renderer load failure and no crash. The only console line is the unrelated Discord Rich Presence connection notice.
- Regression tests additionally lock the real-time seek pacing, the 24–256 MiB priming clamps, the optional language mapping and `a:0` default disposition, the Torrentio `x.km-file` episode selection, the per-branch HTTP/HTTPS agent binding, and the player publishing the resolved dub as the progressive stream's sole audio track.
- The audio-verification probe was exercised against real FFmpeg output on three fixtures: a genuine two-audio MKV (`[en, es]`, Spanish requested → Spanish plays), a reproduction of the reported Zootopia 2 failure with one English audio stream plus Spanish and French *subtitle* tracks (`[en]`, Spanish requested → correctly reports English, and the Spanish subtitle track is not mistaken for a dub), and an unreadable input (returns nothing and keeps the previous behaviour). Live Torrentio metadata for `tt26443597` confirmed the release advertises `🇬🇧 / 🇪🇸 / 🇫🇷`, so discovery was right to offer it and only the post-resolve claim was wrong.
- Further regression tests lock the renderer-side seek boundaries: the explicit torrent-seeking state, the watchdog standing down while it is set, the grace window clearing on `canplay`/`playing`/media error, generic embed fallback refusing an explicitly chosen torrent, both switch paths pausing the outgoing video, and the settings panel no longer auto-closing on a playback resume.

Manual, still required (needs live peers and several minutes of playback):

1. Open a title with dubbed 1080p releases and pick a `Torrent - Spanish-1080P` source.
2. Confirm the Audio setting reads **Spanish**, not English or Original, and that Spanish audio plays. If the release only advertised Spanish (subtitle-derived flags), expect a notice naming the audio it really carries — and expect the "more languages" Spanish entry to skip that release entirely.
3. Confirm initial playback starts and the source stays pinned (no silent switch to another provider).
4. Scrub forward past the buffered region and confirm the player reloads at `?start=…&dur=…`, buffers, and resumes.
5. Let it play for at least five minutes past the seek point and confirm no Stream Error appears.
5a. During the post-seek spinner, confirm the player does not switch source or show a fallback error while the forward window downloads, and that opening the gear leaves the settings panel open when playback resumes.
6. Check the KokoMovie log for `ffmpeg exited` lines; there should be none reporting an invalid language map.
7. Repeat with a French or Portuguese release and confirm the Audio label follows the release language.

On a starved swarm the seek is expected to fail fast with a `503` from the stream server rather than to start and die later; arbitrary seeking is not guaranteed without sufficient peers and throughput.

## Phase 5 offline verification

- Online runtime smoke populated 9 versioned TMDB cache entries (114,331 JSON bytes) and 81 artwork files through the custom protocol.
- `KOKOMOVIE_OFFLINE_TEST=1 DISPLAY=:1 timeout 30s npm run dev` launched the real app using forced network failure and retained cache without runtime errors.
- Automated tests cover local search/merge, cache-cleared movie and TV download reconstruction, bounded MP4 byte ranges, direct offline subtitle URL resolution, SRT-to-WebVTT normalization, and download progress reconciliation.
- Cache controls delete only TMDB JSON and artwork; watchlist, positions, downloads, portable media, and sidecars remain intact.


## Phase 10 release verification (2026-08-03)

Performed on Electron 43.2.0 / electron-builder 26.15.7, Linux x64 host:

- **Runtime smoke.** Electron 43 reports Node 24.18.0, Chromium 150, `NODE_MODULE_VERSION` 148. better-sqlite3 v13's N-API prebuild opens a database, enables WAL, and round-trips a write; keytar loads.
- **Data migration.** The existing v1.4.1-era `kokomovie.db` opened under the new stack with all five tables, `journal_mode=wal`, and `integrity_check=ok`.
- **FFmpeg licensing.** The vendored archive matches its pinned SHA-256; the configure string read back out of the binary contains no `--enable-gpl`, `--enable-nonfree`, `--enable-libx264`, `--enable-libx265`, or `--enable-libxvid`, and `LICENSE.txt` is the LGPL. Verified for both the Linux x64 ELF and the Windows x64 PE binary.
- **FFmpeg functionality.** The exact production torrent-remux argument list was run against a multi-audio MKV fixture: the requested Spanish track is mapped first and carries the `default` disposition while French follows, which is the behavior dub selection depends on. The `aac` encoder, `mp4`/`mov` muxers, and `matroska`/`avi`/`mov`/`mpegts` demuxers are all present.
- **Packaging.** AppImage and .deb built; `resources/ffmpeg/` contains the binary, `LICENSE.txt`, and `PROVENANCE.json`; all four named binaries (Electron, FFmpeg, keytar, SQLite prebuild) verify as x86-64.
- **Update metadata.** Every `sha512` in `latest-linux.yml` recomputed and matched against its artifact; `blockMapSize` present; artifact filenames match the tag-time expectations.
- **Packaged launch.** The unpacked application started, resolved FFmpeg from `resourcesPath`, and refused the 1.5.1 → 1.4.1 downgrade.
- **Local-data hygiene.** Confirmed at runtime that the legacy `auth-tokens.json` is deleted while `tmdb-key-local` survives in the keychain, and that the dead `access-token` / `refresh-token` entries are removed. Log rotation and oversized-log reclaim were exercised against the compiled `diagnostics.js` with a synthetic 57 MB log.

Not yet performed: Windows and Linux ARM64 install/upgrade on real hardware, and a genuine 1.4.1 → 1.5.1 updater run.

## Phase testing policy

Every later phase adds tests before refactoring its high-risk behavior. Public TMDB/provider sites are manual smoke dependencies, not deterministic automated-test dependencies. Fixtures and temporary databases must cover failure paths locally.
