# Testing and Regression Baseline

**Date:** 2026-08-03
**Automated baseline:** lint, strict renderer/main typecheck, 99 Vitest tests, the production dependency audit policy, the distribution licence gate, and the production build are active gates on the v1.5.1 release line.

## Existing commands

- npm run dev:client: Vite, main-process TypeScript watch, and Electron.
- npm run build: all workspace builds; currently the reliable gate.
- npm test: workspace tests if present.
- client npm test: Vitest; empty suites now fail.
- client npm run test:e2e: Playwright.
- npm run lint: root ESLint command; must be audited before treating as a gate.
- npm run audit:production: production advisory policy with one reviewed exception.
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
