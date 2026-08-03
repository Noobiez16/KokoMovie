# KokoMovie — Phased Implementation Plan

**Baseline:** v1.4.1 · **Reviewed:** 2026-08-03  
**Target release:** v1.5.1 (tag only after all phases and release gates pass)
**Stack:** Electron 31, React 19, Vite 5, TypeScript, SQLite, TanStack Query, Zustand, hls.js

## Product direction

KokoMovie remains a fully local desktop application: no KokoMovie backend, login, accounts, profiles, avatars, required cloud service, telemetry, or analytics. The user installs the app, supplies a TMDB v3 key or v4 token, and browses or watches. Watchlist, history, playback positions, Continue Watching, preferences, provider settings, and downloads stay on-device.

“Fully local” does not mean “never uses the internet.” TMDB metadata, provider resolution, streaming, torrents, downloads, GitHub feedback/update checks, and Discord presence naturally require connectivity. These operations must time out, fail clearly, and never corrupt local state. Previously cached content and completed downloads should remain useful offline.

Preserve the existing design, navigation, player, Help Center, updater, provider race/fallback, subtitles, torrent language selection, portable MP4 downloads, Windows releases, and Linux x64/ARM64 releases.

## Shipped baseline — do not rebuild or regress

1. A deterministic local identity replaces accounts and profile selection.
2. TMDB credentials are user-supplied and stored through the main process in the OS keychain.
3. Deterministic TMDB content IDs avoid a catalog database.
4. SQLite stores watchlist, playback positions, preferences, and downloads.
5. Continue Watching/history enrich local IDs with TMDB summaries.
6. Main-process providers race, validate candidates, and fall back.
7. Playback supports HLS/direct media, subtitles, PiP, next episode, proxying, and manual provider choice.
8. Torrents support bounded startup buffering, language-aware audio choice, and MP4 remuxing.
9. Downloads cover movies, episodes, series, progress, folders, source selection, and portable output.
10. Help → Changelog and GitHub feedback/completion notifications exist.
11. Electron Updater requires a higher semantic version for existing users.
12. CI builds Windows, Linux x64, and native Linux ARM64 with architecture verification.

Add an automated test or parity checklist before changing any item above.

---

## Constitution for every phase

~~~text
1. KEEP IT LOCAL
No backend, login, account, profile, avatar, mandatory cloud, telemetry, or analytics.
Local functionality never depends on a first-party server.

2. PRESERVE THE PRODUCT AND DESIGN
Do not redesign. Reuse current colors, typography, spacing, components, transitions,
navigation, and player patterns. Do not regress catalog, TMDB setup, search, details,
providers, playback, subtitles, torrents, downloads, local library state, Help Center,
Discord presence, or updates.

3. PROTECT LOCAL DATA
Store state under Electron userData in SQLite or the OS keychain. Never silently upload
library data, activity, credentials, paths, or diagnostics.

4. CONTROL NETWORK AND HOSTILE INPUT
Use timeouts, cancellation, bounded responses, and clear errors. Keep contextIsolation
enabled and nodeIntegration disabled. Expose narrow typed preload APIs. Validate IPC,
provider output, subtitles, imported files, paths, and update metadata. Never log secrets.

5. WORK IN SMALL, REVERSIBLE STEPS
Read affected files first. Use one phase branch and logical Conventional Commits. Never
discard user work, rewrite history, force-push, merge, publish, or tag without approval.

6. VERIFY REALITY
Use scripts that exist in the repository. Run relevant tests, the client TypeScript
build, and the full build. Runtime-test Electron when IPC, native modules, playback,
downloads, updater, or packaging changes.

7. RELEASE CORRECTLY
Every published update needs a higher semantic version. Replacing same-version assets
The roadmap release target is v1.5.1; do not create that tag before final approval.
does not update installations already running that version.
~~~

## Branch protocol

1. Run **git status --short** and stop for unexplained tracked changes.
2. Record **git rev-parse HEAD** as the rollback SHA.
3. Create **phase/N-slug**; optionally add **backup/pre-phase-N-date** at the rollback SHA.
4. Execute one phase only. Never stash or delete user work.
5. Commit logical units with the required author and no Co-Authored-By trailer.
6. Test/build and produce a phase report: files, results, manual checks, risks, branch, rollback SHA.
7. Stop for human validation. Do not merge, push, publish, or tag unless requested.

---

## Phase 1 — Baseline and regression map

**Branch:** phase/1-baseline · **Risk:** Low

- Inventory live main/renderer files, IPC/preload contracts, SQLite schema, and storage.
- Inventory TMDB, provider, torrent, GitHub, Discord, and other network destinations.
- Record BrowserWindow/session flags, CSP, protocols, and loopback servers.
- Map provider extraction/race/validation/fallback, proxy, playback, torrent, and download flows.
- Build a manual regression matrix covering TMDB setup, browse/search/movie/TV details, watchlist, positions, Continue Watching, playback/fallback/subtitles, downloads, Help Center, updater, and release architectures.
- Reconcile **docs/architecture.md** instead of creating a competing document.
- Record actual commands; do not invent lint/typecheck scripts.

**Deliverables:** updated architecture, current-state report, ADR log, testing baseline, ranked risks.  
**Acceptance:** no application changes and full build passes.

## Phase 2 — Repository sanitation and one startup path

**Branch:** phase/2-repository-cleanup · **Depends on:** 1 · **Risk:** Medium

- Prove legacy services, Terraform, Docker, load tests, and backend variables are unused.
- Preserve them on an archive branch before removal.
- Remove unused workspaces/scripts only after archival.
- Make root development start Electron without service health checks.
- Keep shared packages only when used by the live client.
- Remove generated JS/declaration/map files from service source trees and prevent recurrence.
- Reduce environment examples to live needs; never ship user credentials.
- Review ignores, then update README/architecture after runtime verification.
- Validate a clean install and **npm run dev:client** without a backend.

**Acceptance:** one client-only startup path works and no live import references removed code.

## Phase 3 — Tests and typed boundaries

**Branch:** phase/3-test-foundation · **Depends on:** 1 · **Risk:** Medium

- Test TMDB IDs/mappers, local identity, subtitle logic, source ranking, and stream probes.
- Test watchlist, positions, preferences, and downloads against temporary SQLite.
- Test preload/IPC without exposing raw ipcRenderer.
- Add provider fixtures for success, timeout, invalid/expired media, HTML placeholders, and cancellation.
- Test download state transitions/finalization without public providers.
- Add packaged startup, Settings, navigation, and Help Center smoke tests.
- Set achievable subsystem coverage targets; add scripts only after proving them.

**Acceptance:** deterministic tests need neither real providers nor a real TMDB key and protect v1.4.1.

## Phase 4 — Security, privacy, and legal compliance

**Branch:** phase/4-security-legal · **Depends on:** 1, 3 · **Risk:** High

- Audit main, extraction, and auxiliary windows separately.
- Keep the renderer isolated with minimal preload access.
- Harden extraction incrementally: scoped sessions, denied permissions/popups/navigation/downloads, bounded lifetime, cleanup, concurrency limits, and tested filters.
- Validate IPC payloads/senders, prioritizing credentials, filesystem, providers, torrents, and downloads.
- Keep TMDB secrets in the keychain and redact errors/logs.
- Audit SQL, WAL/foreign keys, loopback servers, paths, filenames, and archives.
- Derive CSP/allowlists from Phase 1 measurements.
- Verify update HTTPS, metadata, checksums/signatures, and platform limitations.
- Determine bundled FFmpeg licensing before choosing a project license.
- Add TMDB attribution, third-party notices, security, privacy, and legal documents.
- Preserve Help Center feedback without exposing local data.

**Acceptance:** unsafe configurations fail automated checks; playback/download/update parity remains green.

## Phase 5 — Durable catalog and graceful offline behavior

**Branch:** phase/5-offline-catalog · **Depends on:** 1, 3, 4 · **Risk:** Medium

- Put credential-bearing TMDB requests behind a main-process repository.
- Add versioned metadata caching with bounded, policy-compliant retention.
- Cache artwork under userData through a constrained custom protocol.
- Hydrate watchlist/history/Continue Watching/downloads from cache before refreshing.
- Search cached/downloaded metadata locally and merge online results.
- Preserve the API-key-required screen; add no seed catalog without explicit product/legal approval.
- Add existing-style cached/offline/error states.
- Make downloads self-describing with local metadata, artwork, and subtitles where available.
- Verify offline seeking, subtitles, byte ranges, and progress.
- Add cache controls that never delete downloads or library records.

**Acceptance:** after prior online use, airplane mode shows/searches cached library data, plays downloads, and saves progress; fresh installs clearly request TMDB setup.

## Phase 6 — Provider evolution without playback regression

**Branch:** phase/6-provider-evolution · **Depends on:** 3, 4 · **Risk:** Very high

- Keep bundled providers as reference behavior until parity is proven.
- Extract internal types, schemas, cancellation, health, and ranking.
- Add fixtures/mocks for every enabled provider.
- Standardize timeouts, domain permissions, limits, SSRF defense, circuit breakers, and redacted diagnostics.
- Migrate one provider at a time with a rollback adapter.
- Always ship a verified bundled provider set.
- Consider installable packs only after contract stability: validated manifest/API, domains, license, integrity/signature, isolated runtime, permission confirmation, and last-known-good rollback.
- Defer a remote registry until signing, revocation, compromise recovery, and offline startup are proven.
- Preserve ordering, enable/disable, race/fallback, chooser, subtitles, torrents, and downloads.

**Acceptance:** clean installs play immediately; provider failure cannot crash the app or block local features.

## Phase 7 — Downloads and local-library resilience

**Branch:** phase/7-downloads-library · **Depends on:** 3, 5 · **Risk:** High

- Formalize download states and restart recovery.
- Add pause/range resume only where supported.
- Preserve portable MP4s, torrent language selection, progress, folders, and cleanup.
- Validate output before deleting temporary data; preserve recoverable partial state.
- Store sufficient local metadata for offline use.
- Sanitize folders, filenames, sidecars, archives, and disk-space handling.
- Make folder import explicit and reviewed; never silently scan, rename, or move originals.
- Preserve existing paths and add database backup/orphan detection.

**Acceptance:** interrupted jobs recover; completed files work offline; v1.4.1 downloads migrate losslessly.

## Phase 8 — Library portability without accounts

**Branch:** phase/8-library-portability · **Depends on:** 3, 5, 7 · **Risk:** Medium

- Start with versioned manual export/import of local state and optional artwork.
- Validate files, preview changes, and automatically back up SQLite.
- Offer explicit merge/replace with deterministic conflict rules.
- Optionally encrypt exports with authenticated encryption and memory-hard derivation.
- Later support atomic watched-folder snapshots for Syncthing, USB, or network drives.
- Keep sync disabled by default; never add a KokoMovie cloud backend/account.
- Treat online sync integrations as separate privacy/legal/API proposals.

**Acceptance:** two installations transfer state losslessly through a file without a server or account.

## Phase 9 — UX, accessibility, diagnostics, and performance

**Branch:** phase/9-quality-of-life · **Depends on:** 3, 5, 6 · **Risk:** Medium

- Reuse current patterns for loading, empty, error, offline, provider, download, and updater states.
- Preserve Continue Watching; alter only for measured defects.
- Add cancellation/debounce/pagination where needed.
- Audit keyboard use, focus, ARIA, contrast, reduced motion, captions, and player controls.
- Add discreet provider health without exposing URLs, headers, or tokens.
- Add rotating redacted local logs and user-reviewed diagnostic export; never auto-send.
- Measure performance before adding virtualization/caching complexity.
- Preserve Help → Changelog and Send Feedback.

**Acceptance:** no redesign; clearer failures and accessible operation; diagnostics contain no secrets, history, paths, or provider tokens.

## Phase 10 — CI, release engineering, and documentation

**Branch:** phase/10-release-readiness · **Depends on:** validated prior phases · **Risk:** Medium

- Add CI progressively: install, lint, typecheck, tests, licenses, audit policy, build.
- Use OS jobs for native Electron dependencies.
- Preserve Linux x64; native ARM64 staging/verification plus stable-host wrapping; Windows native-binary checks; version-tag publishing.
- Verify filenames, latest metadata, blockmaps, checksums, and updater compatibility.
- Add signing/notarization when available and document unsigned limits.
- Test upgrade from the previous public version; never reuse a published version.
- Update README, architecture, legal/security docs, user/provider guides, and changelog from verified behavior.
- Test clean install/upgrade on Windows, Linux x64, and ARM64; keep macOS build-only until validated.
- Do not tag before user runtime/installer approval.

**Acceptance:** CI passes, installers launch, old data migrates, updater selects the correct architecture, and the release uses a new version.

---

## Order and release gates

| Phase | Name | Depends on | Risk |
|---|---|---|---|
| 1 | Baseline/regression map | — | Low |
| 2 | Repository sanitation | 1 | Medium |
| 3 | Tests/typed boundaries | 1 | Medium |
| 4 | Security/privacy/legal | 1, 3 | High |
| 5 | Durable catalog/offline | 1, 3, 4 | Medium |
| 6 | Provider evolution | 3, 4 | **Very high** |
| 7 | Downloads/local library | 3, 5 | High |
| 8 | Library portability | 3, 5, 7 | Medium |
| 9 | UX/diagnostics/performance | 3, 5, 6 | Medium |
| 10 | CI/release/docs | Validated phases | Medium |

Phases 5 and 6 may proceed independently after Phase 4. Phase 7 must preserve both.

Before release, pass the full build, relevant tests/typechecks, Electron launch, TMDB v3/v4 setup, catalog/detail flows, local persistence, provider playback/fallback/subtitles, stream/torrent downloads, offline completed-file playback, Help Center, updater-from-previous-version, and Windows/Linux architecture inspection. Commit no secrets, generated service files, release staging, or personal data.

## Final rule

Make KokoMovie more reliable, secure, testable, and offline-capable without making it a different product. If an idea conflicts with the shipped local experience, preserve the experience, document the tradeoff, and redesign the phase—not the application.
