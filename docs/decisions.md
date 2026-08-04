# Architecture Decisions

## ADR template

### ADR-NNN: Title

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded
- **Context:** What problem and constraints exist?
- **Decision:** What will be done?
- **Alternatives:** What else was considered?
- **Consequences:** Benefits, costs, risks, and rollback.

## ADR-001: Preserve the fully local product boundary

- **Date:** 2026-08-03
- **Status:** Accepted
- **Context:** KokoMovie previously contained hosted-service code but v1.4.1 runs entirely as a desktop client.
- **Decision:** No backend, login, accounts, profiles, mandatory cloud sync, telemetry, or analytics will be introduced. TMDB/provider/update traffic remains direct and local user state remains on-device.
- **Alternatives:** Restore hosted services; require third-party accounts.
- **Consequences:** Lower operational burden and stronger privacy; cross-device features must use explicit export or optional user-controlled mechanisms.

## ADR-002: Preserve working providers during modularization

- **Date:** 2026-08-03
- **Status:** Accepted
- **Context:** Playback depends on externally unstable providers and extraction behavior.
- **Decision:** Establish tests/contracts and migrate providers individually with rollback adapters. Always ship a verified bundled set.
- **Alternatives:** Replace all providers with installable packs in one release.
- **Consequences:** Slower migration but substantially lower playback-regression risk.

## ADR-003: v1.5.1 is the roadmap release target

- **Date:** 2026-08-03
- **Status:** Accepted
- **Context:** v1.4.1 is already released and equal versions do not trigger Electron Updater.
- **Decision:** Develop locally on 1.5.1 and create the tag only after every release gate and human runtime check passes.
- **Alternatives:** Reuse v1.4.1; publish intermediate roadmap states.
- **Consequences:** Existing installations can update when complete; no partial roadmap code is pushed or published.

## ADR-005: Ship an LGPL FFmpeg and license KokoMovie GPL-3.0-or-later

- **Date:** 2026-08-03
- **Status:** Accepted
- **Context:** `ffmpeg-static` bundles a binary configured `--enable-gpl --enable-version3`. That forced GPL-3.0 obligations onto every installer and, with no project license selected, blocked the release. KokoMovie only uses stream copy, the native AAC encoder, the MP4/MOV muxers, and the Matroska/AVI/MOV/MPEG-TS demuxers — none of which are GPL-only.
- **Decision:** Vendor a checksum-pinned LGPL-3.0 FFmpeg 8.1 build from BtbN/FFmpeg-Builds through `scripts/fetch-ffmpeg.mjs`, ship it via `extraResources` outside the asar archive with its license text and provenance, and license KokoMovie itself GPL-3.0-or-later. `npm run check:licenses` enforces both.
- **Alternatives:** `@ffmpeg-installer/ffmpeg` — rejected: it declares LGPL-2.1 but ships a 2018 binary configured `--enable-gpl --enable-libx264 --enable-libx265`. Building FFmpeg from source per release — rejected as disproportionate. Dropping remux support — rejected: it would remove torrent dub selection and portable MP4 output.
- **Consequences:** Distribution is compliant and auditable, and FFmpeg advances 7.0.2 → 8.1. The LGPL binary is larger (115 MB vs ~78 MB), which grows the Linux x64 AppImage to ~164 MB. macOS has no vendored binary and stays build-only.

## ADR-006: Upgrade to Electron 43 and electron-builder 26

- **Date:** 2026-08-03
- **Status:** Accepted
- **Context:** Electron 31 shipped Chromium 126, roughly two years stale, while the extraction window renders untrusted provider pages with `webSecurity` disabled. electron-builder 25 needed a manually pinned `app-builder-bin@5.0.0-alpha` prerelease for Linux ARM64 packaging.
- **Decision:** Move to Electron 43.2.0 (Chromium 150, Node.js 24) and electron-builder 26.15.7, bump better-sqlite3 to v13, and drop the `app-builder-bin` pin.
- **Alternatives:** Incremental major-by-major upgrades — rejected after typecheck and packaging proved clean, since the codebase already used `protocol.handle` rather than the removed `registerFileProtocol` family.
- **Consequences:** Large security gain. electron-builder 26 removed its native `app-builder-bin` helper in favour of pure JS, so the ARM64 workaround disappears. better-sqlite3 v13 switched to ABI-stable N-API prebuilds, so it no longer needs a per-Electron rebuild but also no longer appears under `build/Release/` — CI verification was rewritten to name binaries explicitly.

## ADR-007: Declare Rollup's per-platform binaries as explicit optional dependencies

- **Date:** 2026-08-03
- **Status:** Accepted
- **Context:** The v1.5.1 tag build failed on both cross-platform runners: Linux ARM64 could not resolve `@rollup/rollup-linux-arm64-gnu` and Windows could not resolve `@rollup/rollup-win32-x64-msvc`, while Linux x64 passed. The lockfile recorded only the two x64 Rollup binaries even though it carried all 23 esbuild platform packages — npm had pruned the non-matching Rollup optional dependencies when the lockfile was last regenerated on a linux-x64 host (npm/cli#4828). Because `npm ci` installs strictly from the lockfile, no runner could recover at install time.
- **Decision:** Declare `@rollup/rollup-linux-x64-gnu`, `@rollup/rollup-linux-arm64-gnu`, and `@rollup/rollup-win32-x64-msvc` as root `optionalDependencies` pinned to Rollup's exact resolved version, so every shipped platform is recorded in the lockfile.
- **Alternatives:** `npm install --package-lock-only` and npm's `--os`/`--cpu` overrides were both tried first and neither restored the missing entries. Deleting the lockfile and reinstalling would have re-resolved every dependency immediately before a release, invalidating the audit and licence gate results.
- **Consequences:** `npm ci` now installs the correct native binary on each runner; the `os`/`cpu` constraints keep the other platforms from being installed where they do not apply. **These pins must be bumped together with Rollup:** the native binary version has to match the `rollup` package exactly, so any Vite upgrade that moves Rollup requires updating all three versions here.

## ADR-008: Validate packaging configuration in the unit suite

- **Date:** 2026-08-03
- **Status:** Accepted
- **Context:** The v1.5.1 Windows job failed three consecutive times, each on a different step, and each round trip cost a full CI run because packaging is the last thing that executes. The final failure was a single invalid key: `win.sign` is the electron-builder 27 name, while 26 declares `win` with `additionalProperties: false`, so the whole block became invalid. Nothing in the repository could detect that without running electron-builder itself, and electron-builder only runs after the quality gate, a renderer build, native rebuilds, and FFmpeg vendoring have all succeeded on a packaging runner.
- **Decision:** Validate all three electron-builder configurations against `app-builder-lib/scheme.json` — the schema the installed version actually validates with — inside the Vitest suite, using the same ajv options as `app-builder-lib`'s own `validateSchema`. Include a negative test asserting the offending key is still rejected.
- **Alternatives:** Running `electron-builder --dir` in the quality job would catch it but needs per-platform runners and downloads a full Electron distribution. Trusting documentation was what failed here: the public docs describe `sign: false` as valid because they render the newest version, and the shipped 26.15.7 schema has no `sign` property at all.
- **Consequences:** Configuration defects surface in the quality gate in milliseconds instead of after three packaging jobs. The check is pinned to whatever electron-builder version is installed, so an upgrade that renames keys fails the suite immediately and points at the exact path. The negative test keeps the validator from silently degrading into one that accepts anything.

## ADR-004: Archive and remove the legacy backend tree

- **Date:** 2026-08-03
- **Status:** Accepted
- **Context:** Services, Docker, Terraform, load tests, deployment workflow, seed data, and the shared workspace had no live Electron imports but complicated installs and audits.
- **Decision:** Preserve commit c241a2d on archive/pre-phase-2-legacy, then remove the unused stack and target the client as the only npm workspace.
- **Alternatives:** Leave deprecated code in place; split it into another repository immediately.
- **Consequences:** Clean installs are smaller and cannot accidentally start obsolete infrastructure. Historical code remains recoverable from the local archive branch.
