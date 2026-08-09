# Testing and Regression Baseline

**Date:** 2026-08-08
**Automated baseline:** lint, strict renderer/main typecheck, 113 Vitest tests, the production dependency audit policy, the distribution licence gate, and the production build are active gates on the v1.5.2 optimization line.

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
