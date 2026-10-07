# v2.0.0 source priority and E2E typing implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Check the native tests statically and prefer the highest genuinely available non-CAM source on every new search.

**Architecture:** E2E TypeScript reuses the existing preload contract. Discovery ranks validated media by release evidence and resolution, waits for bounded provider discovery when a higher tier is still possible, and never promotes CAM by pixel count. Provider/source caches must not preserve a previous CAM choice across fresh searches.

**Tech Stack:** TypeScript, Electron, Playwright, Vitest; no new dependencies.

## Global constraints

- Version stays 2.0.0; preserve logo and theme colors.
- Keep CAM/TS as explicit last-resort fallback and preserve confirmation.
- Prefer 2160p, then 1440p, 1080p, 720p among compatible validated non-CAM sources; no invented variants or upscaling.
- Preserve manual source/quality selection and HLS automatic bandwidth adaptation.
- Keep discovery bounded and existing provider preferences; use isolated credentials in native tests.
- Do not change the unrelated dirty release workflow or install/publish binaries.
- Update product documentation only after functional verification.

### Task 1: E2E static checking

**Files:** create standard `client/e2e/tsconfig.json`; modify `client/e2e/fullscreen-video.spec.ts`, other E2E typing only if diagnostics require, and root `package.json`.

**Interfaces:** reuse `client/src/renderer/vite-env.d.ts` Window/ElectronAPI; annotate locator callback video elements as `HTMLVideoElement`.

- [x] Reproduce diagnostics with dedicated configuration and shared renderer declarations (33 errors, including sixteen fullscreen diagnostics).
- [x] Place the config at `client/e2e/tsconfig.json`, extending `../tsconfig.json`, `noEmit: true`, including `**/*.ts`, `../playwright.config.ts`, and `../src/renderer/vite-env.d.ts`; verify installed TSserver assigns fullscreen to that configured project with zero diagnostics. The initial nonstandard filename passed CLI but was not discovered by the editor.
- [x] Fix actual diagnostics without `any`, suppression, or duplicate preload contracts.
- [x] Add `tsc -p client/e2e/tsconfig.json --noEmit` to root `typecheck` before main compilation.
- [x] Run E2E compiler and focused fullscreen native tests against compiled app; report exact counts/results.
- [x] Review changed files before scoped commit.

### Task 2: Source discovery priority

**Files:** inspect and minimally modify `client/src/main/providers/source-quality.ts`, `source-discovery.ts`, `client/src/main/ipc/providers.ts`; extend renderer lib source quality/discovery tests and IPC behavioral integration tests using existing harnesses.

**Interfaces:** retain `classifySourceQuality`, `rankProviderResults`, `shouldResolveAutomaticSource`; preserve IPC contracts and status snapshots.

- [x] Trace extractor/session caches and renderer request lifetime, documenting whether a previous CAM choice survives a fresh lookup.
- [x] Write and run failing behavioral tests: early 720p cannot beat later 1440p/2160p; CAM 2160p loses to validated non-CAM 720p; unknown source at higher tier competes fairly with declared standard source; terminal/deadline fallback remains usable; fresh lookups re-extract.
- [x] Implement bounded selection that waits for enabled pending providers when the best source is below 2160p, resolving immediately for a genuine top-tier eligible source, or at completion/deadline. Rank compatible validated non-CAM sources by resolution; release evidence breaks ties. Retain validation safety and CAM warning.
- [x] Correct nominal resolution thresholds if necessary so 960x540 does not become 720p while cinema aspect 1282x534 still does.
- [x] Read HLS probe from validated upstream rather than a rejected localhost proxy URL; preserve trusted source headers and public redirect/DNS policy. Bound probe response size and elapsed lifetime, handle response errors and strip credential headers on cross-origin redirect. Valid media without dimension evidence stays Unknown and usable as fallback; failed probes are rejected instead of assigned a guessed tier.
- [x] Run relevant quality/discovery/IPC tests, renderer/main types, full suite, lint, build and isolated native tests.
- [x] Review and commit implementation; update changelog/testing/current state after passing checks, with honest external availability limits.

### Completion

- [x] Final whole-change review, fix actionable findings and recheck affected gates.
- [x] Keep changes on `codex/kokomovie-v2-source-priority`, preserving previous branch as recovery.
