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

## ADR-004: Archive and remove the legacy backend tree

- **Date:** 2026-08-03
- **Status:** Accepted
- **Context:** Services, Docker, Terraform, load tests, deployment workflow, seed data, and the shared workspace had no live Electron imports but complicated installs and audits.
- **Decision:** Preserve commit c241a2d on archive/pre-phase-2-legacy, then remove the unused stack and target the client as the only npm workspace.
- **Alternatives:** Leave deprecated code in place; split it into another repository immediately.
- **Consequences:** Clean installs are smaller and cannot accidentally start obsolete infrastructure. Historical code remains recoverable from the local archive branch.
