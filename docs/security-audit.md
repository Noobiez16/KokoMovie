# KokoMovie — Security Audit

**Version:** 1.5.1
**Date:** 2026-08-03
**Scope:** The Electron desktop client in `client/` — the only shipped component
**Framework:** OWASP Top 10 (2021) + Electron security checklist
**Runtime:** Electron 43.2.0 · Chromium 150 · Node.js 24.18.0

> **Supersedes the pre-1.5.0 audit.** Every claim below was re-verified against current source.
> The previous revision of this document described microservices, JWT/RS256 sessions, bcrypt,
> Redis, PostgreSQL, DynamoDB, Docker networking, Terraform infrastructure, Widevine DRM, and
> certificate pinning. **None of that exists.** It was archived on `archive/pre-phase-2-legacy`
> and removed in Phase 2. There is no backend, no account, no server-side authorization, and no
> telemetry to audit.

---

## Threat model

KokoMovie is a single-user local desktop application. The assets worth protecting are the user's
TMDB credential, their local library (watchlist, history, positions), their filesystem, and their
machine's network position. The adversary is **hostile remote content**: provider embed pages,
CDN responses, subtitle files, torrent peers, and TMDB/GitHub responses. There is no multi-tenant
boundary, so classic access-control and session risks do not apply; injection, SSRF, hostile
renderer content, and path handling do.

| Category | Status | Basis |
|---|---|---|
| A01 Broken Access Control | N/A | Single local user; no server, no roles, no cross-tenant data |
| A02 Cryptographic Failures | PASS | Downloaded segments AES-256-GCM; TMDB credential in the OS keychain (`keytar`), never on disk in plaintext |
| A03 Injection | PASS | `better-sqlite3` prepared statements throughout; Zod schemas on IPC; FFmpeg spawned via `spawn()` with an argument array, never a shell |
| A04 Insecure Design | REVIEW | Extraction windows run hostile pages with `webSecurity` disabled — accepted, compensated, documented below |
| A05 Security Misconfiguration | REVIEW | Main window fully hardened; production CSP still carries `'unsafe-inline' 'unsafe-eval'` and broad `https:` fallbacks |
| A06 Vulnerable Components | PASS | `npm run audit:production` gates every high/critical production advisory; one reviewed exception |
| A07 Auth & Session Failures | N/A | No authentication exists |
| A08 Software/Data Integrity | REVIEW | Updater is HTTPS with SHA-512 block-map verification; installers are unsigned |
| A09 Logging & Monitoring | PASS | Rotating, size-bounded, redacted local diagnostics; nothing transmitted automatically |
| A10 SSRF | PASS | API proxy allowlisted to TMDB/GitHub; stream proxy rejects private, loopback, link-local, and credentialed targets |

---

## Electron process isolation

### Main window — `client/src/main/index.ts:57`

| Control | Value | Line |
|---|---|---|
| `contextIsolation` | `true` | `index.ts:68` |
| `nodeIntegration` | `false` | `index.ts:69` |
| `nodeIntegrationInSubFrames` | `false` | `index.ts:70` |
| `sandbox` | `true` | `index.ts:71` |
| `webSecurity` | `true` | `index.ts:72` |
| `allowRunningInsecureContent` | `false` | `index.ts:73` |
| `webviewTag` | `false` | `index.ts:79` |
| `experimentalFeatures` | `false` | `index.ts:80` |
| `plugins` | `false` | `index.ts:78` |
| Popups | denied via `setWindowOpenHandler` | `index.ts:112` |
| Navigation | restricted via `will-navigate` | `index.ts:118` |

The preload (`client/src/main/preload.ts`) exposes only named methods through `contextBridge`.
Raw `ipcRenderer` is never exposed.

### Extraction windows — `client/src/main/stream-extractor/index.ts:203`

This is the application's highest-risk surface: it loads attacker-influenced provider pages in
Electron-controlled Chromium.

| Control | Value | Line |
|---|---|---|
| Session | fresh random ephemeral partition per attempt | `stream-extractor/index.ts:197` |
| `contextIsolation` | `true` | `:214` |
| `nodeIntegration` | `false` | `:212` |
| `sandbox` | `true` | `:215` |
| `webviewTag` | `false` | `:216` |
| `allowRunningInsecureContent` | `false` | `:217` |
| **`webSecurity`** | **`false`** unless `FORCE_WEB_SECURITY=true` | `:223` |
| Permissions | all denied | `:200` |
| Downloads | cancelled | `:201` |
| Popups | denied | `:246` |
| Navigation | non-`http(s)` protocols blocked | `:237` |
| Concurrency | capped at `MAX_EXTRACTION_WINDOWS` | `:229` |
| Lifetime | bounded by timeout + `AbortSignal` | `:236`, `:262` |
| Teardown | listeners removed, window destroyed, `clearStorageData()` | `:277`–`:284` |

**Accepted risk (unchanged, rank 1).** `webSecurity: false` is required because providers serve
manifests and segments without CORS headers. The compensating controls are that the window has no
Node access, no persistent session, no permissions, no popups, no downloads, no images, a bounded
lifetime, and a wiped partition. It never touches the main window's session. Tightening this
requires provider parity tests first.

---

## Content Security Policy — `client/src/main/index.ts:138`

Production policy actually shipped:

```
default-src 'self'
script-src  'self' 'unsafe-inline' 'unsafe-eval' https://*.youtube.com https://www.youtube.com
            https://s.ytimg.com https://static.doubleclick.net https://www.google.com
style-src   'self' 'unsafe-inline' https:
media-src   'self' blob: https: http: http://localhost:* offline:
connect-src 'self' http://localhost:* ws://localhost:* https: offline:
img-src     'self' data: blob: https: catalog-cache: offline:
frame-src   'self' https://*.youtube.com https://*.youtube-nocookie.com https://*.ytimg.com https:
font-src    'self' data: https:
```

**Status: REVIEW, not PASS.** Three weaknesses are knowingly retained:

1. `script-src` allows `'unsafe-inline'` and `'unsafe-eval'`. Removing them requires reworking the
   YouTube trailer iframe embed and verifying the Vite production bundle needs no `eval`.
2. `media-src` allows plain `http:`, needed because some provider CDNs still serve segments over
   HTTP. This permits cleartext media transport.
3. `frame-src` ends in a bare `https:`, which is broader than the YouTube-only intent expressed by
   the preceding entries.

The `catalog-cache:` and `offline:` schemes are registered as privileged/secure/standard before
`app.ready` (`index.ts:33`) and served through `protocol.handle` (`catalog-artwork.ts:64`,
`index.ts:186`) — the modern API, not the removed `registerFileProtocol` family.

---

## IPC boundary

- **Sender validation.** `assertTrustedRenderer` (`ipc/security.ts:6`) accepts only `file:` frames
  or the two development origins `http://localhost:5173` / `http://127.0.0.1:5173`; anything else
  throws `Untrusted IPC sender`.
- **Payload validation.** Zod schemas cover the API proxy, keychain credentials, download IDs,
  metadata, headers, subtitles, artwork, source URLs, destination folders, provider requests, and
  library import files.
- **API proxy.** `validateApiProxyUrl` allows only HTTPS `api.themoviedb.org` and `api.github.com`
  on port 443, method `GET` only, and only the `accept`, `authorization`, and
  `x-github-api-version` request headers (`ipc/security.ts:20`). Credentialed URLs, look-alike
  hosts, alternate ports, and request bodies are rejected. Covered by
  `client/src/renderer/lib/security-boundaries.test.ts`.
- **Legacy surface.** The dormant auth/refresh-token and `oauth:callback` handlers noted in Phase 1
  were removed with the account UI in Phase 9.

## Local network services

The HLS/subtitle proxy (`ipc/providers.ts:941`) and the torrent server (`ipc/torrent.ts:501`) both
bind explicitly to `127.0.0.1` on an ephemeral port and are unreachable off-host. The stream proxy
rejects private, loopback, link-local, multicast, credentialed, non-HTTP(S), and undeclared
redirect targets; the same policy is reused for downloads and is covered by 19 assertions in
`provider-network-policy.test.ts`.

## Local data

- Database: `userData/kokomovie.db`, WAL and foreign keys enabled at startup, all access through
  prepared statements.
- TMDB credential: OS keychain via `keytar` only. A legacy plaintext credential is migrated once
  and deleted after a successful keychain write.
- Downloads: AES-256-GCM per segment, key derived with HKDF-SHA256, IV random per segment.
- Filenames and destination folders are validated and contained; orphan detection is report-only
  and never touches user-selected folders.
- Library export contains no credentials, no absolute media paths, and no provider secrets.

## Diagnostics and privacy

Diagnostics are rotating, size-bounded, and redacted at write time. The Settings report uses an
allowlisted aggregate schema that excludes credentials, content identifiers, watch history,
provider URLs and headers, and filesystem paths. The complete JSON is displayed for review before
a manual save dialog. Nothing is transmitted automatically. No telemetry or analytics exists.

## Supply chain and distribution

- **Dependency audit policy.** `npm run audit:production` fails on every high or critical
  *production* advisory except `GHSA-qwww-vcr4-c8h2` for exactly `react-router-dom@7.18.2`. That
  advisory concerns React Server Components and server actions; KokoMovie is a client-only Vite SPA
  with neither. The script also fails if the pinned version changes or the reviewed advisory
  disappears, so the exception cannot silently outlive its justification.
- **Licence gate.** `npm run check:licenses` fails on any production dependency that is
  undeclared, unrecognised, or incompatible with GPL-3.0-or-later distribution, and re-verifies the
  bundled FFmpeg's recorded provenance.
- **Bundled FFmpeg.** Replaced GPL `ffmpeg-static` with a pinned LGPL-3.0 build. The archive is
  SHA-256 verified and the configure string is read back out of the binary and rejected if it
  contains `--enable-gpl`, `--enable-nonfree`, `--enable-libx264`, `--enable-libx265`, or
  `--enable-libxvid` (`scripts/fetch-ffmpeg.mjs`).
- **Runtime currency.** Electron 31 → 43 moves the shipped Chromium from 126 to 150, closing
  roughly two years of accumulated Chromium and V8 security fixes. This is the single largest
  security improvement in this release.
- **Updates.** `electron-updater` over HTTPS from GitHub Releases with SHA-512 block-map
  verification; downgrades are refused. Installers are **unsigned** on Windows and Linux — users
  may see OS trust prompts and there is no platform-level publisher identity. Every release
  therefore publishes `SHA256SUMS.txt` for manual verification. macOS stays build-only until Apple
  signing and notarization are configured.

---

## Open findings

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | High | Extraction windows run hostile pages with `webSecurity: false` | Accepted; compensated by ephemeral partition, sandbox, denied permissions/popups/downloads, bounded lifetime. Needs provider parity tests before tightening. |
| 2 | Medium | Production CSP retains `'unsafe-inline'`, `'unsafe-eval'`, bare `https:` in `frame-src`, and `http:` in `media-src` | Open. Requires reworking the YouTube embed and confirming provider HTTPS coverage. |
| 3 | Medium | Windows and Linux installers are unsigned | Open, documented. Mitigated by published SHA-256 checksums. |
| 4 | Low | Provider/CDN behaviour is externally unstable | Accepted; circuit breaker plus redacted diagnostics. |
| 5 | Low | Torrent playback joins a public swarm with the user's IP | Accepted and surfaced in Settings with a VPN recommendation. |

## Verification commands

```bash
npm run lint             # ESLint 9, zero warnings enforced
npm run typecheck        # strict renderer + main-process typecheck
npm test                 # deterministic Vitest suite, including boundary tests
npm run audit:production  # production advisory policy
npm run check:licenses   # distribution licence gate
npm run build            # production build
```
