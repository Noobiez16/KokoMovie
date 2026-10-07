# KokoMovie Integrated Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the four requested shell/catalog UX changes in v2.0.0.

**Architecture:** Keep AppLayout and LibraryMenu, add a focused HeaderSearch component using the existing catalog API and TanStack Query. Preserve the legacy Search route for direct links. Root owns native integration, final gates and product documentation.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, CSS, Vitest and Playwright Electron.

## Global Constraints

- Version 2.0.0 exclusively; original logo and palette unchanged.
- No new dependencies or Electron/IPC/backend/player changes.
- Preserve existing saved items, history, downloads, maturity policy and localization EN/ES/FR.
- Do not modify .github/workflows/electron-release.yml.
- Work locally in codex/kokomovie-v2-inline-search from 2d9ec65; do not install, publish, merge or push.

### Task 1: Shell, library, catalog and inline search

**Files:** Modify components/layout/AppLayout.tsx, LibraryMenu.tsx, pages/Browse.tsx and History.tsx, styles/globals.css and existing i18n resources/tests; create components/layout/HeaderSearch.tsx and its behavioral test file. All renderer paths are under client/src/renderer. Root will adapt client/e2e/platform-ui.spec.ts, docs and package after this task.

**Interfaces:** Consume catalogApi.search(q, params?, 'local'), settings store, existing content summary identity and detail links. Produce HeaderSearch integrated in AppLayout. Existing /search route remains unchanged and the header omits its redundant search control there; Ctrl/Cmd+K focuses its existing input.

- [x] Read design doc, inspect existing tests/query invalidation/locale policy, and write focused failing tests for behavior changes. Avoid mirror tests for simple CSS/copy.
- [x] Run focused tests and record meaningful RED evidence.
- [x] Remove topbar separator; remove Home watchlist row/query; keep one real Continue Watching row and preserved no-hero layout.
- [x] Replace duplicate library links with Mi biblioteca (localized) and give History page a shared heading/description while preserving tabs and deep links.
- [x] Implement left-expanding header search and panel below field, debounce 300 ms, minimum two characters, up to eight results, no route change on typing, keyboard selection, Escape/focus/outside behavior, errors/retry, stale suppression, locale/maturity invalidation and reduced motion. Preserve actual API boundaries.
- [x] Run focused tests, TypeScript and lint for changed files; self-review. Do not alter native tests or docs yet, do not commit (root commits verified results with scoped git approval).
- [x] Report changed files, commands/results, RED/GREEN evidence, concerns to client/.codex/inline-implementation-report.md.

### Task 2: Native integration, documentation and verification (root)

**Files:** client/e2e/platform-ui.spec.ts, README.md, docs/current-state.md, docs/testing.md, docs/changelog.md; output report/captures; no product scope expansion.

- [x] Update native expectations for consolidated menu and removed Home watchlist; preserve SQLite library/history workflows.
- [x] Test real Electron inline search route stability, actual suggestions/details, keyboard/closing, normal/reduced animation, clean header and width geometry; capture screenshots.
- [x] Run full unit suite, renderer/main TypeScript, lint, build and native suite once on final implementation; investigate failures before changing code.
- [x] Review task diff using a fresh reviewer, fix Important/Critical issues, then broad final branch review.
- [x] Update v2.0.0 documents with verified results and regenerate/check local Windows package. Original installed shortcut is not replaced.
- [x] Commit scoped files, preserve unrelated workflow modification and recovery branches; finish on local branch.

Final verification: 531 units, 14 native tests, both TypeScript targets, full lint zero errors/warnings and build passed. Task and whole-change reviews approved with no Critical/Important findings. Local Windows package verified; all 28 renderer assets match the tested build. Existing infrastructure warnings remain recorded separately. Work stays on the local branch; no install, publish, merge or push.

