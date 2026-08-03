# Testing and Regression Baseline

**Date:** 2026-08-03
**Automated baseline:** lint, strict renderer/main typecheck, 11 Vitest tests, and the production build are active gates on the v1.5.1 development line.

## Existing commands

- npm run dev:client: Vite, main-process TypeScript watch, and Electron.
- npm run build: all workspace builds; currently the reliable gate.
- npm test: workspace tests if present.
- client npm test: Vitest; empty suites now fail.
- client npm run test:e2e: Playwright.
- npm run lint: root ESLint command; must be audited before treating as a gate.

Phase 3 added deterministic TMDB, identity, and provider-contract tests. IPC, SQLite, download, extractor, and packaged-app suites remain planned.

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

## Phase testing policy

Every later phase adds tests before refactoring its high-risk behavior. Public TMDB/provider sites are manual smoke dependencies, not deterministic automated-test dependencies. Fixtures and temporary databases must cover failure paths locally.
