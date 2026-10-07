# KokoMovie Fullscreen Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Complete the five requested search, feature-removal and fullscreen refinements in v2.0.0.

**Architecture:** Extend the existing search disclosure lifecycle, remove the isolated watch-availability feature, and diagnose viewport/art/video behavior through real Electron and focused media fixtures. Keep existing source/ABR boundaries.

**Tech Stack:** React, CSS, TypeScript, TanStack Query, Electron, HLS.js, Vitest and Playwright.

## Global Constraints

- Version 2.0.0 exclusively; original logo and palette unchanged.
- No new dependencies, installed upgrade, publication, merge or push.
- Preserve actual playback providers, downloads, maturity filtering, locale and IPC security.
- Do not modify .github/workflows/electron-release.yml.
- Work in codex/kokomovie-v2-fullscreen-polish from1cc797a.

### Task 1: Search exit and quiet empty state

Files: components/layout/HeaderSearch.tsx and its tests; styles/globals.css. Paths under client/src/renderer.
- [x] Write failing lifecycle tests, run RED, implement right-closing animation with safe immediate inactive state, canceled timers on reopen/unmount and reduced-motion closure.
- [x] Hide panel for fewer than two characters, remove instruction from header search only, preserve search/locale/maturity/focus/navigation behavior.
- [x] Run focused tests, TypeScript and scoped lint; self-review and report to client/.codex/fullscreen-search-report.md. Root commits and reviews. No other files/docs/native changes.

### Task 2: Remove watch availability completely

Files: components/catalog/WhereToWatch.tsx, api/watch-availability.ts, its dedicated tests, ContentDetail import/render, store/settings, EN/ES/FR resources, lib/tmdb.ts availability-only metadata and client methods, i18n/LocaleBootstrap roots, main/ipc/tmdb-repository.ts specific allowlist branches, relevant mocks. Root owns native fixtures/docs. Do not edit artwork helpers or protocol files.
- [x] Capture removal regression RED for denied specific endpoints and no detail country/provider calls; remove feature and its dead code/tests with correct boundaries.
- [x] Drop watchCountry from persisted settings without retaining old unknown properties. Preserve other settings. Preserve playback-provider code and generic catalog metadata.
- [x] Run focused tests, both TypeScript targets and scoped lint; report to client/.codex/fullscreen-removal-report.md. Root commits and reviews.

### Task 3: Fullscreen artwork

Files: HeroBanner/ContentDetail artwork, styles/platform.css, focused responsive-artwork helper/component tests, main/catalog-artwork.ts if verified sizes need extension; video/player files only when a reproduced cause warrants it. Root owns client/e2e platform/portable media tests.
- [x] Diagnose source geometry, fixed height/cover crop, image sizes/protocol and fullscreen/video session/quality lifecycle before fixing.
- [x] Implement complete-art framing and large-screen layout using real viewport/density-aware image sizes and preserved offline URLs. Verify large16:9 and ultrawide geometry.

### Task 4: Actual video quality and fullscreen continuity

Files: renderer/lib/video-quality.ts and tests, player/VideoPlayer.tsx, PlayerControls.tsx and focused tests; translated unavailable label only if needed.
- [x] Correct verified tier classification (960x540 must remain540; use accurate standard height thresholds and preserve cinematic width tiers).
- [x] Observe intrinsic video dimensions on metadata/resize, resetting only with real source changes; show direct-video quality even without HLS.
- [x] Show720p/1080p with unavailable options disabled when no matching variant exists; preserve real other HLS tiers, automatic adaptation and manual selection. Never invent higher resolution.
- [x] Focused RED-GREEN regressions cover direct720/1080, unknown metadata, genuine tier selection and fullscreen lifecycle. Root's real Electron720/1080 tests already reproduced missing direct-video Quality row.

### Task 5: Root integration, verification and documentation

- [x] For video, reproduce with real local media/fullscreen and focused HLS tests, correct verified reset/cap/rendering cause if found; preserve automatic bandwidth adaptation and selected quality. Report source limits honestly.
- [x] Integrate user clarification: actual monitor dimensions, real 1080p/720p availability in Quality, detected direct-video resolution and fullscreen selection continuity. Video diagnostic report found no fullscreen reset; don't introduce a guessed reset fix or force ABR maximum. Use fresh implementation/review for this focused quality UI task if needed.
- [x] Update native expectations for absence of availability and search closing state; test normal/reduced motion, reopen and fullscreen continuity.
- [ ] Run fresh full unit, lint, TypeScript, build and native gates; task/final reviews; fix blockers. Update v2.0.0 docs, package verification and output report only after functional completion. Keep new branch locally.
