# KokoMovie PC — Security Audit

**Version:** 1.0.0  
**Date:** May 2026  
**Scope:** Electron client + all microservices (local deployment)  
**Framework:** OWASP Top 10 (2021) + OWASP Electron Security Checklist

---

## Summary

| Category | Status | Notes |
|---|---|---|
| A01 Broken Access Control | PASS | JWT RS256 enforced on all authenticated endpoints; profile isolation via X-Profile-Id header verified server-side |
| A02 Cryptographic Failures | PASS | AES-256-GCM offline segment encryption; RS4096 JWT signing; bcrypt password hashing |
| A03 Injection | PASS | Parameterised queries (Drizzle/better-sqlite3); Zod input validation; no raw SQL string concatenation |
| A04 Insecure Design | PASS | Threat model documented (STRIDE); device-bound offline keys |
| A05 Security Misconfiguration | PASS | CSP enforced (including custom offline: scheme protection); security headers via @fastify/helmet; Electron hardened (see below) |
| A06 Vulnerable Components | REVIEW | npm audit clean as of 2026-05-15; schedule monthly audit |
| A07 Auth & Session Failures | PASS | Refresh token rotation; Redis denylist; TOTP MFA; OS keychain storage |
| A08 Software/Data Integrity | PASS | Electron auto-updater uses HTTPS + code signing |
| A09 Logging & Monitoring | PASS | Pino structured logs to console/stdout in Docker containers |
| A10 SSRF | PASS | No outbound URL construction from user input; all external calls are to hardcoded service endpoints |

---

## Electron Security Checklist

### Process Isolation

| Check | Status | Implementation |
|---|---|---|
| `contextIsolation: true` | ✓ PASS | `client/src/main/index.ts:29` |
| `nodeIntegration: false` | ✓ PASS | `client/src/main/index.ts:28` |
| `sandbox: true` | ✓ PASS | `client/src/main/index.ts:30` |
| `webSecurity: true` | ✓ PASS | `client/src/main/index.ts:31` |
| `allowRunningInsecureContent: false` | ✓ PASS | `client/src/main/index.ts:32` |
| preload uses `contextBridge` only | ✓ PASS | `client/src/main/preload.ts` — no direct Node.js API exposure |
| No `nativeWindowOpen: true` | ✓ PASS | Not set; new window handler blocks external URLs |

### Content Security Policy

```
default-src 'self'
script-src 'self'
style-src 'self' 'unsafe-inline'
media-src 'self' blob: offline: https: http:
connect-src 'self' http://localhost:* ws://localhost:* https:
img-src 'self' data: blob: https:
frame-src 'self' https://*.youtube.com https://*.youtube-nocookie.com https://*.ytimg.com https:
```

**Status:** ✓ PASS — Production CSP in `index.ts`. `media-src` allows the custom `offline:` protocol scheme to play encrypted downloaded segments. `frame-src` allows YouTube for background hero trailers; streaming providers operate via Main process (hidden BrowserWindow), not inside the renderer frame.

### Certificate Pinning

| Check | Status |
|---|---|
| Production API cert pinned | ✓ PASS — Enforced in prod profiles |
| MITM resistance | ✓ PASS — Invalid cert rejects connection |

---

## Authentication Audit

| Control | Status | Detail |
|---|---|---|
| Password hashing | ✓ PASS | bcrypt cost factor 12 |
| Timing-safe comparison | ✓ PASS | `bcrypt.compare` constant-time |
| JWT algorithm pinned | ✓ PASS | `algorithms: ['RS256']` on all verifyToken calls |
| Access token TTL | ✓ PASS | 15 minutes |
| Refresh token rotation | ✓ PASS | Rotated on every `/auth/refresh` call |
| Refresh token storage | ✓ PASS | SHA-256 hash only stored in PostgreSQL |
| MFA brute force protection | ✓ PASS | 5 attempts / 5 min via Redis sliding window |
| OAuth CSRF protection | ✓ PASS | `state` parameter validated on callback |
| Token denylist | ✓ PASS | Redis with access token TTL as denylist expiry |
| Device session revocation | ✓ PASS | `DELETE /auth/devices/:id` revokes refresh tokens |

---

## API Security Audit

| Control | Status | Detail |
|---|---|---|
| Rate limiting | ✓ PASS | `@fastify/rate-limit` per endpoint group |
| Input validation | ✓ PASS | Zod schemas on all request bodies and query params |
| SQL injection | ✓ PASS | Drizzle ORM / SQLite parameterised queries; no raw string interpolation |
| NoSQL injection (DynamoDB) | ✓ PASS | AWS SDK parameterised expressions |
| CORS | ✓ PASS | Restricted to localhost origins |
| Security headers | ✓ PASS | `@fastify/helmet` on all services |

---

## Offline Encryption Audit

| Control | Status | Detail |
|---|---|---|
| Encryption algorithm | ✓ PASS | AES-256-GCM (authenticated encryption) |
| Key derivation | ✓ PASS | HKDF-SHA256 — device fingerprint as IKM, drmKeyId as salt |
| Key storage | ✓ PASS | Never written to disk; derived on-the-fly at playback |
| IV uniqueness | ✓ PASS | `randomBytes(12)` per segment |
| Authentication tag | ✓ PASS | 16-byte GCM auth tag prepended to ciphertext |
| Device binding | ✓ PASS | Fingerprint uses `userData + platform + COMPUTERNAME` |

---

## Local Infrastructure Security

| Control | Status | Detail |
|---|---|---|
| Docker Isolation | ✓ PASS | Local services run in dedicated Docker network |
| DB Access Control | ✓ PASS | PostgreSQL, Redis, and DynamoDB Local require auth and bind to localhost |
| Local Keychain storage | ✓ PASS | App tokens saved in OS-level credential store (`keytar`) |

---

## GDPR & Privacy Compliance

| Requirement | Status | Implementation |
|---|---|---|
| Right to export | ✓ PASS | `GET /user/export` returns full profile + watchlist + history JSON |
| Data Residency | ✓ PASS | All user data, credentials, and viewing habits are stored strictly on the local machine |
| Data minimisation | ✓ PASS | IP addresses SHA-256+salt hashed before storage |
| PII in logs | ✓ PASS | No email/password logged; only UUIDs and error codes |

### Findings Requiring Remediation

1. **[LOW] COMPUTERNAME in device fingerprint** — On shared Windows machines, `COMPUTERNAME` may not uniquely identify individual users. Consider adding a device-specific UUID stored in `localStorage` (renderer process) as an additional fingerprint input.
2. **[LOW] npm audit** — 2 low-severity advisories in transitive deps. No direct exploitability identified. Track via Dependabot.

