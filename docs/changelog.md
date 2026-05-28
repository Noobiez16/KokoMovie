# Changelog

All notable changes to KokoMovie PC are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.4-beta] — 2026-05-28 — Security Hardening, User-Configured TMDB Keys & New Branding Icon

### Added
- **User-Configurable TMDB API Key**: Integrated a local settings store (`settingsStore` via Zustand/localStorage) and professional API Configuration UI. Users can input and validate their own TMDB API keys directly in the application Settings. This allows zero-config binary execution without requiring local/backend `.env` variables, passing the key dynamically via `X-TMDB-Key` HTTP headers to backend services.
- **Premium Tabbed Settings Dashboard**: Refactored the settings screen into a highly structured, horizontal-tab layout (Preferences, API Configuration, Downloads, and Privacy) and removed all emojis in favor of sleek, custom vector SVG graphics. Includes an interactive Preset Avatar selector featuring 6 theme options (Sunset Palm, Retro Cinema, Voyager, Spotlight, Synthwave, and Peak) to update profile pictures instantly without server load, while preserving custom image uploads.
- **Tropical Branding & Brand Icon**: Recreated the KokoMovie logo and application icon with a fresh theme: a vibrant neon-accented palm tree wrapped in a classic celluloid film strip (styled like a decorated Christmas tree) over a dark-purple glassmorphic background. Rebuilt icons for all platforms (Windows `.ico`, macOS `.icns`, Linux `.png`s).

### Fixed & Hardened (Snyk Vulnerabilities Mitigation)
- **Electron Main Process & IPC Security**:
  - Addressed 51 security issues reported during the repository audit.
  - Implemented strict regex and path resolution validation in the downloader to prevent directory traversal attacks.
  - Restricted provider IPC service listeners to the local loopback (127.0.0.1) and added rate limiting, timeout handling, and request bounds.
  - Restricted the `postMessage` event handlers in `HeroBanner` to target origin `https://www.youtube.com` only.
  - Sanitized backend error responses to prevent internal stack trace or system information leakage.
- **Client & Subtitles Sanity**:
  - Implemented secure URL sanitization for movie trailers and background backdrop images in `ContentDetail` to block open redirects and cross-site scripting (XSS).
  - Validated buffer types in the DRM widevine handler to prevent out-of-bounds memory exposure.
  - Hardened automated unit/integration tests by purging hardcoded authentication passwords and API key secrets.
  - Upgraded dependencies (`drizzle-orm`, `@fastify/jwt`) to resolve upstream CVEs.
- **Infrastructure Security**:
  - Hardened Terraform AWS modules: configured AWS KMS CMK encryption for S3 buckets, turned on DynamoDB Point-in-Time Recovery (PITR), enabled ECS Container Insights, locked down ECR tags with immutability, and configured AWS VPC flow logs.
  - Established a `.snyk` baseline policy file to track accepted architecture choices.

---

## [1.0.3-beta] — 2026-05-22 — Custom Settings, Offline Support & Downloader Stabilisation

### Added
- **Offline Playback & Custom Protocol**: Registered `offline://` custom protocol scheme to securely fetch and decrypt downloaded segments on-the-fly, enabling smooth video playback without internet access.
- **Custom Download Location**: Added configuration settings to type or browse (via native directory picker) a custom download path, stored persistently in `localStorage`.
- **Viewing History List Tab**: Added a "+ My List" watchlist tab inside the Watch History page to easily browse bookmarked movies and series.
- **Episode-Level & Multi-Season Downloads**: Introduced a 3-dots actions menu next to "+ My List" on movie/series details and next to episode play buttons, enabling download of individual episodes, movies, or all seasons.
- **Watchlist Optimistic Updates**: Implemented React Query optimistic cache mutations for instant visual toggling of "+ My List" / "✓ In My List" buttons.
- **HLS Stream Quality Optimization (1080p Target)**: Master HLS manifest parser now grades and selects standard height 1080p variants first, using standard aspect-ratio mapping (getStandardHeight), before falling back to highest bandwidth or standard resolutions.
- **Startup Queue Auto-Resume**: Interrupted active downloads are automatically reset to 'pending' and resumed on application start.

### Fixed
- **Picture-in-Picture Removal**: Disabled Picture-in-Picture globally in the media player and removed its buttons/handlers to maintain layout integrity.
- **Downloader Timeout & Progress Calculations**: Added a 30-second request timeout to prevent hanging connections, and fixed progress percentage tracking for segments with unknown/chunked HTTP content lengths.
- **Immediate Cancel Deletion**: Updated cancel behavior to instantly abort running segment fetches, delete the corresponding local files/folders, and wipe the sqlite database record.
- **Header Merging & Casing Conflicts**: Merges scraper and custom headers case-insensitively, preventing duplicate cased header keys (e.g. Referer vs referer) that caused CDN 403 Forbidden blocks.
- **Original Protocol Preservation**: Proxy URLs and downloaded segment requests correctly preserve HTTP vs HTTPS protocols, preventing timeouts and socket connection errors on HTTP-only stream variants.

---

## [1.0.2-beta] — 2026-05-20 — Source Switching & Availability Indicators

### Added
- **Source Availability Badges (A/S)**: "Select Source" dropdown now shows a green **A** badge for providers with a confirmed pre-extracted stream, and a dimmed red **S** badge for providers that returned nothing during the initial race. Available sources are listed first above a divider; shut-down entries remain clickable for on-demand re-extraction.

### Fixed
- **Source Switching Broken**: `VideoPlayer` accepted an `allStreams` prop from `Player.tsx` but it was missing from the TypeScript `Props` interface, causing it to be silently dropped. Every source switch triggered a fresh 30s extraction instead of using the pre-collected streams, making nearly all alternative sources appear broken.
- **Instant Source Switching**: `handleSourceChange` now checks `allStreams` first. Providers collected during the initial race switch instantly with no IPC call; only uncached providers fall through to the slow extraction path.
- **Duplicate Movie Keys**: `Movies.tsx` deduplicates entries by ID before rendering, resolving the React `key` warning when the catalog API returns duplicate records.

---

## [1.0.1-beta] — 2026-05-20 — High Quality Streaming Upgrades

### Changed
- **High-Quality Resolution Filtering**: Integrated resolution parsing into the HLS local proxy. The proxy automatically filters out stream variants below 720p (such as 360p or 480p) from HLS manifests, ensuring playback defaults to HD (720p/1080p).
- **Auto 720p/1080p Selection**: Standardized stream levels so the player presents Auto, 720p, and 1080p, and defaults to 1080p when bandwidth is sufficient.

### Fixed
- **VidLink Extraction 404**: Corrected VidLink provider URL mapping by stripping the `/embed` route prefix, restoring instant stream extraction and high-quality 1080p streams.
- **VidSrc.me Domain Update**: Swapped the defunct `vidsrc.me` with the active `vidsrcme.su` domain.
- **VidSrc.in Domain Update**: Swapped the defunct `vidsrc.in` with the active `vsrc.su` domain.

---

## [1.0.0-beta] — 2026-05-19 — UI, UX and Provider Expansion

### Added
- **UI/UX Purple Theme**: Completely redesigned the UI moving away from a Netflix clone to a premium dark-purple aesthetic with dynamic animations, glassmorphism, and updated dropdown components.
- **Hero Trailer Backgrounds**: Added dynamic YouTube background trailers in the HeroBanner. Uses `ResizeObserver` for exact 16:9 full-cover scaling and `postMessage` API for fluid mute/unmute toggling without iframe reloads.
- **Expanded Provider Engine**: Added multiple new active stream providers (`VidSrc.pro`, `VidSrc.rip`, `VidSrc.su`, `VidSrc.pm`, `VidSrc.in`, `VidLink`, `VidSrc.cc`).
- **Direct Video Extraction**: Added `.mp4` and `.webm` format capture in the extraction engine for faster direct-play media link discovery.

### Changed
- **Staggered Parallel Racing**: Sped up provider stream discovery by reducing stagger time to 1.5 seconds and timeout to 8 seconds.
- **Resource Blocking**: Stream extractor headless window now aggressively blocks `.css` and font assets to speed up extraction page loads.

### Fixed
- **"Content Not Found" on Reload**: Implemented reversible UUID encoding for content IDs to allow dynamic on-the-fly TMDB synchronization, eliminating 404s when reloading a content detail page.
- **CAM/TS Quality Filter**: Implemented `isCamStream` detection in the extractor to aggressively reject low-quality theater recordings and prioritize HD streams.
- **TV Season Sync Dropouts**: Forced the synchronization engine to always upsert all episodes for all seasons rather than skipping if some already existed.
- **Search Sync Drift**: Fixed `Search.tsx` state drift by syncing the query parameter in the URL with the local React state via `useEffect`.

---

## [2.0.0] — 2026-05-17 — Aggregator Architecture Pivot

### Breaking Changes

This release is a fundamental architectural pivot from a self-hosted Netflix clone to a **content aggregator**. The application no longer hosts or serves video — it sources streams from third-party providers on demand.

### Removed

- **Billing Service** — Stripe subscriptions, plan tiers (Basic/Standard/Premium 4K), invoice history, billing UI, billing API client. All content is now free to watch.
- **Kafka / Redpanda** — All Kafka brokers, producers, and consumers removed from every service. Playback events and recommendation pipelines were fully decoupled.
- **OpenSearch** — Full-text search replaced with TMDB `/search/multi` endpoint. No local search index required.
- **AWS infrastructure requirement** — No S3, CloudFront, MediaConvert, MSK, Personalize, or ECS required. Docker Compose with 3 containers is sufficient.
- **"AI Search" / Semantic search mode** — UI toggle removed; search now calls TMDB directly. `catalogApi.semanticSearch` kept in API client but not exposed in UI.
- **Plan tier badges** on content cards — `planMinimum` no longer displayed.
- **Billing nav item** — Replaced with Providers.

### Added

#### TMDB Integration

- **Catalog service** now backed by TMDB API (`TMDB_API_KEY` env var)
  - `GET /catalog/browse/home` — live TMDB trending + 12 genre rows from `discoverMovie`/`discoverTv`
  - `GET /catalog/browse` — TMDB `/movie/popular` + `/tv/popular` when no filters applied
  - `GET /catalog/trending` — TMDB `/trending/all/week`
  - `GET /catalog/search` — TMDB `/search/multi`
  - `POST /catalog/sync` — on-demand full sync of a TMDB item: fetches `external_ids.imdb_id`, cast (top 10), and all season episodes into local PostgreSQL DB
- **Deterministic UUIDs** from TMDB type+id (`tmdbContentId()`): stable content IDs across all services, computed client-side before DB sync
- **All seasons synced** — `syncTv()` now fetches episode details for all seasons (up to 8), not just season 1
- **Lazy episode loading** — `serveFromDb()` detects seasons with 0 episodes and fetches them from TMDB on first content detail request, retroactively fixing old synced entries

#### Providers Framework (Electron Main Process)

- **Provider interface** (`client/src/main/providers/interface.ts`) — `Provider`, `StreamRequest`, `ProviderResult`, `StreamSource`
- **Registered providers:**
  - `vidsrc` — vidsrc.to, IMDB ID preferred, TMDB fallback
  - `vidsrc-me` — vidsrc.me, TMDB ID via `?tmdb=` query params
  - `2embed` — 2embed.cc, IMDB ID preferred
  - `superembed` — multiembed.mov, TMDB ID only
- **Provider registry** (`registry.ts`) — persistent JSON prefs in Electron `userData`, enabled by default, survives restarts
- **Stream extractor** (`stream-extractor/index.ts`) — hidden `BrowserWindow` with persistent session, `webRequest.onSendHeaders` as primary stream detector (captures URL + headers simultaneously), `onHeadersReceived` as Content-Type fallback, `onBeforeRequest` for ad blocking; 2-attempt retry; 30s timeout; UA rotation
- **IPC handlers** (`ipc/providers.ts`) — `providers:list`, `providers:toggle`, `providers:getStream`, `providers:getFirstStream`, `providers:registerStreamHeaders`
- **Stream header injector** — `initStreamHeaderInjector()` patches `session.defaultSession.webRequest.onBeforeSendHeaders` on startup; injects provider-captured headers (Referer, etc.) into all HLS segment requests transparently

#### Frontend Updates

- **Source picker modal** in `ContentDetailPage` — shows all enabled providers, per-provider loading spinner, error display, link to Providers settings if none enabled
- **Providers settings page** (`/providers`) — toggle switches per provider with descriptions
- **Player accepts direct stream URLs** — navigation state `{ streamUrl, streamHeaders }` bypasses playback service session creation; synthetic `PlaybackSession` created locally
- **`streamHeaders` prop** on `VideoPlayer` — registers headers with main process header injector on mount
- **HLS.js error recovery** — `NETWORK_ERROR` → `startLoad()`, `MEDIA_ERROR` → `recoverMediaError()`, fatal → error state UI with "Choose Another Source" button
- **HLS.js retry config** — `manifestLoadingMaxRetry: 3`, `fragLoadingMaxRetry: 3`
- **`ContentCard`** passes `{ tmdbId, tmdbType }` in navigation state for TMDB sync on detail view
- **`HeroBanner`** uses `backdropUrl ?? s3Thumbnail`; passes `{ tmdbId, tmdbType }` state
- **`ContentSummary` type** updated: `backdropUrl`, `imdbId`, `tmdbId` fields added
- **`HomeData.featured`** typed as `ContentSummary | null` (TMDB home returns summaries, not full detail)
- **Download button** hidden when content has no `s3HlsKey` (TMDB content has no hosted HLS)

### Fixed

- **Season 2+ empty episode list** — `syncTv` was only fetching episodes for season 1; now syncs all seasons
- **Empty headers on provider streams** — `onBeforeRequest` was firing before headers were set; switched to `onSendHeaders` as primary detector
- **Provider registry crash on first run** — `writeFileSync` failing when `userData` dir didn't exist; added `mkdirSync(dirname(path), { recursive: true })`
- **`billingClient` leftover export** in `api/client.ts` — removed
- **`ContentDetail.backdropUrl` duplicate** in TypeScript interface — removed redundant field declaration from `ContentDetail` (inherited from `ContentSummary`)

### Architecture

- Architecture document (`docs/architecture.md`) rewritten from v1.0.0 (AWS microservices self-hosted Netflix) to v2.0.0 (aggregator model)
- `docker-compose.yml` reduced to 3 services: PostgreSQL, Redis, DynamoDB Local
- README rewritten to reflect aggregator model and new Getting Started flow

---

## [1.0.0] — 2026-05-15 — Phase 5 Complete (Sprint 9) — Production Ready

### Added

#### Epic 9 — DevOps, Infrastructure & Hardening

**Terraform IaC (E9-S1)**
- Full modular Terraform infrastructure under `infra/terraform/`
  - `modules/vpc` — VPC with 3 AZs, 3-tier subnets (public/private/database), 3 NAT Gateways, 5 security groups (ALB, ECS, RDS, Redis, MSK), VPC flow logs to CloudWatch
  - `modules/ecr` — 6 ECR repositories (auth, catalog, playback, user, recommendation, billing) with lifecycle policies (keep 10 tagged + 5 untagged) and `scan_on_push = true`
  - `modules/rds` — Aurora PostgreSQL 16 Global Database, Multi-AZ writer + reader, 35-day automated backups, PITR enabled, enhanced monitoring, Secrets Manager rotation
  - `modules/dynamodb` — 6 tables (playback_sessions, playback_positions, watchlists, viewing_history, ab_experiments, ab_assignments) with Global Tables replication (us-east-1 + us-west-2), TTL, PITR
  - `modules/elasticache` — Redis 7.2 cluster mode (3 shards), TLS + AUTH token, slow logs
  - `modules/msk` — MSK Kafka 3.6.0, SASL/IAM auth, 3 brokers (kafka.m5.large), 4 topics with retention config
  - `modules/s3` — media/assets/ingest buckets, versioning, Intelligent-Tiering, access logging, public access blocked
  - `modules/cloudfront` — 2 distributions (media CDN + API passthrough), OAC for S3 access, WAF v2 (OWASP CRS + rate limit 3k req/5min per IP), custom cache policies
  - `modules/ecs` — ECS Fargate cluster, ALB with HTTPS listener + ACM cert, 6 task definitions, path-based routing, deployment circuit breaker with rollback, Container Insights, auto-scaling at 70% CPU
  - `modules/route53` — A/AAAA alias records, health checks, automatic failover policy to us-west-2
  - Root module: S3 + DynamoDB remote state backend, separate staging/production tfvars
  - `envs/staging.tfvars` — reduced instance sizes for cost (t3.small DB, cache.t3.medium Redis)
  - `envs/production.tfvars` — production sizing (r6g.large Aurora, cache.r7g.large Redis, kafka.m5.large MSK)

**Terraform CI/CD (E9-S2)**
- `.github/workflows/terraform.yml` — OIDC AWS authentication, validate → plan-staging → apply-staging → plan-production → apply-production (manual gate), plan artifacts uploaded, PR comments with plan output

**k6 Load Tests (E9-S4)**
- `load-tests/k6/config.js` — shared BASE_URL, TEST_ACCOUNT, global thresholds (http_req_failed < 1%, p95 < 500ms)
- `load-tests/k6/auth.js` — 200 concurrent logins/min, ramping-arrival-rate, login + refresh rotation; `login_duration_ms` p95 < 500ms threshold
- `load-tests/k6/catalog.js` — 500 req/s total (350 browse + 150 search), constant-arrival-rate; `browse_duration_ms` p95 < 150ms (cached), `search_duration_ms` p95 < 300ms
- `load-tests/k6/streaming.js` — 10,000 concurrent streams (ramping-vus: 5m ramp → 10m sustain → 3m ramp-down), 10s position heartbeats; `session_create_duration` p95 < 300ms, `position_update_duration` p95 < 100ms
- `load-tests/k6/smoke.js` — 1 VU sanity check (auth → refresh → catalog browse/genres/search → playback health → user profiles → billing plans), all checks must pass (rate == 1.0)

**Security Audit (E9-S5)**
- `docs/security-audit.md` — comprehensive security assessment
  - OWASP Top 10 (2021): all 10 categories assessed; A06 (Vulnerable Components) flagged for monthly audit schedule
  - Electron Security Checklist: `contextIsolation`, `nodeIntegration: false`, `sandbox`, `webSecurity`, `contextBridge`-only preload, CSP, certificate pinning — all PASS
  - Authentication audit: bcrypt cost 12, JWT RS256 algorithm pinned, 15-min token TTL, refresh rotation, SHA-256 hash-only refresh storage, Redis denylist, MFA brute-force protection — all PASS
  - API security audit: rate limiting, Zod validation, Drizzle parameterised queries, CORS, Helmet headers, Stripe HMAC — all PASS
  - Offline encryption audit: AES-256-GCM, HKDF-SHA256, device-bound keys, per-segment random IV, GCM auth tag — all PASS
  - Infrastructure audit: VPC private subnets, least-privilege SGs, RDS encryption at rest, S3 public access blocked, CloudFront OAC, WAF OWASP CRS, ECR scan-on-push, Secrets Manager — all PASS
  - GDPR: right to export PASS; right to erasure PARTIAL (hard-delete Lambda not deployed — MEDIUM finding)
  - 3 actionable findings: [MEDIUM] hard-delete Lambda pending; [LOW] COMPUTERNAME fingerprint on shared Windows; [LOW] 2 low-severity npm audit advisories
  - Pen test scope defined: auth service, Electron IPC, DRM license proxy, Stripe webhook, S3 signed URLs, API Gateway

**DR Runbook (E9-S6)**
- `docs/dr-runbook.md` — full failover procedure from us-east-1 to us-west-2
  - Phase 1: Aurora Global Database promotion with replication lag verification and Secrets Manager update
  - Phase 2: DynamoDB Global Tables verification (active-active, no promotion needed)
  - Phase 3: ElastiCache Redis DR cluster scale-up and endpoint update
  - Phase 4: MSK Kafka DR cluster verification
  - Phase 5: ECS Fargate service scale-up (warm standby → production), force new deployment, health check validation
  - Phase 6: Route 53 DNS failover (automatic health-check-triggered + manual override procedure)
  - Post-failover: k6 smoke test + manual verification checklist
  - RTO/RPO measurement commands
  - Failback procedure
  - Quarterly DR drill schedule with logging requirements

### Architecture
- RTO < 15 minutes, RPO < 5 minutes achieved via Aurora Global Database + DynamoDB Global Tables + Route 53 health check failover
- ECS deployment circuit breaker with automatic rollback on health check failure
- All secrets in AWS Secrets Manager (DB password, Redis auth token, Stripe key, JWT private key) — no plaintext environment variables in production

---

## [0.5.0] — 2026-05-15 — Phase 4 Complete (Sprints 7–8)

### Added

#### Epic 7 — Stripe Billing

- Billing Service (`services/billing/`) — Fastify 5, Drizzle ORM, PostgreSQL `billing` schema
  - `billing.subscriptions` — account→plan mapping, Stripe customer/sub IDs, trial/renewal dates
  - `billing.invoices` — per-account invoice records with Stripe PDF URLs
  - `billing.webhook_events` — idempotency table keyed on `stripe_event_id`
  - `GET /billing/plans` — public plan comparison (Basic $9.99, Standard $15.99, Premium 4K $22.99)
  - `POST /billing/subscribe` — create subscription (dev: mock IDs, prod: real Stripe customer + subscription)
  - `PUT /billing/subscribe` — upgrade/downgrade plan (prod: proration via Stripe API)
  - `DELETE /billing/subscribe` — cancel at period end
  - `GET /billing/subscription` — current subscription status + planDetails
  - `GET /billing/invoices` — invoice history
  - `POST /billing/portal` — Stripe Customer Portal session URL
  - `POST /billing/webhook` — Stripe webhook handler with HMAC signature verification (raw body via `addContentTypeParser`), two-layer idempotency (unique index + pre-record), handles `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`
  - Dev mode bypass: `STRIPE_SECRET_KEY = 'sk_test_placeholder'` skips all Stripe API calls
- Auth Service updated: plan embedded in JWT at login/register/refresh time
  - `services/auth/src/lib/plan.ts` — `getAccountPlan()` queries `billing.subscriptions` cross-schema; returns `'none'` on expired trial, cancelled, or if billing not yet migrated
  - `services/auth/src/lib/billing.ts` — `createTrialSubscription()` inserts 14-day trial at registration with `ON CONFLICT DO NOTHING`
  - Login, register, and refresh handlers now include `plan` claim in access token
- Client Billing UI
  - `BillingPage` (`/billing`) — three-plan grid with price, features, current-plan badge, Subscribe/Switch buttons; trial countdown; cancel with confirmation; error feedback
  - `InvoicesPage` (`/billing/invoices`) — invoice table with date, amount, status, PDF download; Stripe Customer Portal button
  - `api/billing.ts` — full billing API client (getPlans, getSubscription, create/update/cancelSubscription, getInvoices, createPortalSession)
  - AppLayout: added Billing (`/billing`) nav item

#### Epic 8 — Offline Downloads

- Electron main process — offline download engine (`client/src/main/ipc/download.ts`)
  - AES-256-GCM segment encryption: HKDF key derivation from device fingerprint (SHA-256 of userData + platform + COMPUTERNAME) + drmKeyId as salt, info string `kokomovie-offline-v1`
  - Segment layout: `[IV(12 bytes)][GCM AuthTag(16 bytes)][Ciphertext]`
  - HLS manifest parser: fetches master playlist → picks highest-bandwidth variant → downloads all segments
  - Segments encrypted and stored as `.enc` files; manifest rewritten with `offline://downloadId/seg_N.enc` URLs
  - Concurrent download queue: MAX_CONCURRENT=3, SQLite-persisted status (`pending`/`downloading`/`completed`/`cancelled`/`error`)
  - 30-day TTL enforcement: `purgeExpiredDownloads()` called on app startup
- SQLite store (`client/src/main/db/sqlite.ts`) — WAL mode, `downloads` table with all metadata
- Electron `offline://` custom protocol — registered as privileged scheme, decrypts `.enc` segments on-the-fly via `decryptLocalSegment()` and returns `video/mp2t` responses to hls.js
- IPC channels: `download:start`, `download:cancel`, `download:delete`, `download:list`, `download:get-manifest`
- Preload: `downloadContent`, `cancelDownload`, `deleteDownload`, `listDownloads`, `getOfflineManifest` (replaces legacy `downloadSegment`/`getDownloadQueue` shims)
- Client renderer
  - `api/downloads.ts` — renderer-side download API wrapping `window.electronAPI` calls
  - `DownloadsPage` (`/downloads`) — in-progress list with segment progress bars, available-offline grid with expiry countdown, delete/cancel/play buttons
  - `ContentDetailPage` — Download button queues content; shows `✓ Queued` on success
  - `AppLayout` — added Downloads (`/downloads`) nav item
  - `vite-env.d.ts` — full `ElectronAPI` interface declaration (replaces ad-hoc inline declaration in `main.tsx`)
- New routes: `/downloads`, `/billing`, `/billing/invoices`

#### Infrastructure

- `docker-compose.yml` — Billing service: added `STRIPE_PRICE_*` env vars, added `auth` health-check dependency

---

## [0.4.0] — 2026-05-15 — Phase 3 Complete (Sprints 5–6)

### Added

#### Epic 5 — User Features

- User Service DynamoDB tables: `watchlists` (PK=profileId, SK=contentId, GSI contentId-index) and `viewing_history` (PK=profileId, SK=watchedAt#contentId, 90-day TTL)
- `GET /user/watchlist` — list all watchlist items for active profile
- `POST /user/watchlist/:contentId` — add content to watchlist (409 if already added)
- `DELETE /user/watchlist/:contentId` — remove from watchlist
- `GET /user/watchlist/:contentId/check` — check if specific content is in watchlist
- `GET /user/history` — paginated viewing history with cursor-based pagination (base64url encoded DynamoDB LastEvaluatedKey)
- `GET /user/preferences` — fetch profile language, subtitle, autoplay, maturity rating
- `PUT /user/preferences` — update profile preferences (language, subtitleDefault, autoplay, maturityRating)
- `POST /user/avatar/presign` — generate S3 presigned PUT URL for avatar upload (dev: returns mock localhost URL, prod: real AWS S3 presigned URL via dynamic import)
- `PUT /user/avatar/confirm` — confirm avatar upload and persist CloudFront CDN URL to profile
- `GET /user/export` — GDPR data export: returns all profiles + watchlists + viewing history as downloadable JSON

#### Epic 6 — Recommendations & ML

- Recommendation Service full implementation (was scaffold only)
  - DynamoDB tables: `ab_experiments` and `ab_assignments` — auto-provisioned on startup
  - Default A/B experiments seeded: EXP-001 (row order: 80% control/20% ML-first), EXP-002 (autoplay delay: 10s/5s/15s)
  - Deterministic A/B assignment: `hash(profileId + experimentId) % 100` (no database read needed per request)
  - `GET /recommendations/home` — personalised homepage rows with A/B variant; Redis 2-min cache per profileId+variant
  - `GET /recommendations/similar/:contentId` — "More Like This" content; Redis 2-min cache
  - `GET /recommendations/trending` — trending content by segment; Redis 2-min cache
  - AWS Personalize integration (prod): `USER_PERSONALIZATION` campaign via `PERSONALIZE_CAMPAIGN_ARN` env var, `SIMILAR_ITEMS` campaign via `PERSONALIZE_SIMILAR_CAMPAIGN_ARN`; dev falls back to catalog trending
  - Kafka `playback.events` consumer (non-fatal): receives playback events — logs for prod Personalize event tracker forwarding
  - JWT RS256 authentication on all recommendation endpoints

#### Client UI (Epic 5 + Epic 6)

- `BrowsePage` — added Continue Watching row (from Playback Service `GET /playback/continue-watching`) with per-item progress bars; added Recommendation rows from Recommendation Service above catalog genre rows
- `ContentDetailPage` — Watchlist button (+ My List / ✓ In My List) with optimistic TanStack Query invalidation; "More Like This" row at bottom via Recommendation Service
- `HistoryPage` (`/history`) — infinite-scroll paginated viewing history with per-item progress bars, completion badge, thumbnail, navigate-to-detail on click
- `SettingsPage` (`/settings`) — avatar upload (file picker → S3 presigned PUT → confirm), language selector, autoplay toggle, maturity rating selector, subtitle default input, GDPR data export download
- `AppLayout` — added History and Settings nav items with matching icons
- New routes: `/history`, `/settings`
- New API modules: `api/recommendation.ts` (getHomeRows, getSimilar, getTrending)
- Extended `api/user.ts`: watchlist (get/add/remove/check), history, preferences (get/update), avatar (presign/confirm), export
- Extended `api/playback.ts`: `getContinueWatching` endpoint

#### Infrastructure
- `docker-compose.yml` — User service now depends on `dynamodb-local` with full DynamoDB env vars (region, access keys, endpoint, S3 assets bucket)
- `docker-compose.yml` — Recommendation service now depends on `dynamodb-local` and `auth` with DynamoDB + Personalize env vars

---

## [0.3.0] — 2026-05-15 — Phase 2 Complete (Sprints 3–4)

### Added

#### Epic 3 — Content Catalog & Search

- Catalog Service (`services/catalog/`) — Fastify 5, TypeScript 5.5 strict, Zod validation
  - Full PostgreSQL schema: `content`, `genres`, `content_genres`, `cast_members`, `content_cast`, `seasons`, `episodes` in `catalog` schema
  - Migration + seed data (15 genres, 5 sample titles)
  - `GET /catalog/browse` — paginated browse with genre/type/year filters, Redis 1hr cache
  - `GET /catalog/browse/home` — home page rows (6 genre rows + featured hero), Redis 1hr cache
  - `GET /catalog/trending` — trending content ordered by IMDB score, Redis 1hr cache
  - `GET /catalog/genres` — genre taxonomy, Redis 24hr cache
  - `GET /catalog/content/:id` — full content detail with genres, cast, seasons, episodes; Redis 30min cache
  - `GET /catalog/search` — full-text search via OpenSearch BM25 (fuzzy match, multi-field boost)
  - `GET /catalog/search/semantic` — Claude-powered semantic search: `claude-sonnet-4-20250514` query expansion → 5 alternative terms → OpenSearch multi-term query
  - `POST /catalog/ingest` — admin content ingestion: writes to PostgreSQL + indexes to OpenSearch + emits `content.ingested` Kafka event
- OpenSearch 2.12.0 integration: index auto-provisioned on startup, single-node dev config in Docker Compose
- Kafka producer: `content.ingested` topic for downstream DRM key setup

#### Epic 4 — Video Playback Engine

- Playback Service (`services/playback/`) — Fastify 5, DynamoDB Local backend
  - DynamoDB tables: `playback_sessions` (24hr TTL), `playback_positions` (90-day TTL) — auto-created via `ensureTables()`
  - `POST /playback/session` — creates playback session, generates CloudFront signed URL (dev: mock unsigned), emits `playback.events` Kafka `started` event
  - `GET /playback/session/:id` — session lookup
  - `PUT /playback/position` — position heartbeat (every 10s), auto-marks completed at >95%
  - `GET /playback/position/:contentId` — resume position lookup
  - `GET /playback/continue-watching` — profile's in-progress content (5%–95% watched)
  - `GET /playback/drm/license` — Widevine license proxy (dev: mock license bypass, prod: forwards challenge to license server)
  - `POST /playback/quality-report` — ABR quality change telemetry → Kafka `playback.events`
- CloudFront signed URL generation — dev mode returns unsigned mock URL; prod uses key pair ID + RSA signature with 15-min expiry
- DynamoDB Local added to Docker Compose with persistent volume

#### Client UI (Epic 3 + Epic 4)

- `AppLayout` — sidebar nav: Home, Search, Movies, Series; profile avatar; Sign Out
- `BrowsePage` (`/browse`) — hero banner (top IMDB score), genre rows, trending row; TanStack Query with 5-min stale time
- `SearchPage` (`/search`) — keyword (OpenSearch BM25) and AI semantic toggle; debounced 400ms; expanded terms shown for semantic mode
- `ContentDetailPage` (`/content/:id`) — backdrop image, title/meta/genres/cast, season + episode selector, direct play
- `PlayerPage` (`/player/:contentId/:episodeId?`) — creates playback session then launches player
- `VideoPlayer` — hls.js v1.5 with custom ABR config, auto-level, hardware decode in Electron; full keyboard shortcuts (Space, k, ←→ 10s, ↑↓ volume, m mute, f fullscreen, Esc close)
- `PlayerControls` — seek bar (buffered + progress), play/pause, mute/volume slider, CC selector, quality selector (AUTO + per-level), PiP, fullscreen
- `NextEpisodeOverlay` — countdown timer (10s default), auto-advances; dismiss button
- Skip Intro / Skip Credits buttons appear based on timestamp metadata from catalog
- Position heartbeat every 10s → Playback Service → DynamoDB
- Level change reports to Playback Service → Kafka `playback.events`
- All new routes: `/browse`, `/search`, `/content/:id`, `/player/:contentId`, `/player/:contentId/:episodeId`
- `/home` redirects to `/browse`

#### Infrastructure
- Docker Compose: added `opensearch_data` and `dynamodb_data` named volumes
- Catalog and Playback Dockerfiles fixed (EXPOSE port bug from scaffolding)

---

## [0.2.0] — 2026-05-15 — Phase 1 Complete (Sprints 1–2)

### Added

#### Electron Shell (Epic 1)
- Electron 31 + React 19 + Vite 5 + TailwindCSS 3 monorepo (`client/`)
- Main/Renderer IPC bridge via `contextBridge` — whitelisted API surface only (`preload.ts`)
- `electron-updater` auto-update with delta updates; stable/beta release channels
- `electron-builder` packaging config for Windows (NSIS + portable), macOS (DMG + MAS), Linux (AppImage + deb + Snap)
- Certificate pinning for `api.kokomovie.com` — MITM-resistant, skipped in dev (`cert-pinning.ts`)
- Sentry Electron SDK wired for crash reporting
- Content Security Policy enforced via `session.webRequest.onHeadersReceived`
- Electron security hardening: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`

#### Authentication & Profiles (Epic 2)
- Auth Service (`services/auth/`) — Fastify 5, TypeScript 5.5 strict, Zod validation
  - `POST /auth/register` — email/password registration, timing-safe response
  - `POST /auth/login` — credential login with constant-time password comparison
  - `POST /auth/refresh` — refresh token rotation (old token revoked on every use)
  - `POST /auth/logout` — access token Redis denylist + refresh token revocation
  - `GET /auth/oauth/google` / `GET /auth/oauth/google/callback` — Google OAuth2 PKCE-state flow
  - `POST /auth/mfa/setup` — TOTP secret + QR code + 8 backup codes
  - `POST /auth/mfa/verify` — brute-force throttled (5 attempts / 5 min via Redis)
  - `GET /auth/devices` — list active device sessions
  - `DELETE /auth/devices/:id` — remote device revocation
  - `GET /auth/public-key` — RS4096 public key endpoint (used by downstream services for local JWT verification)
- JWT RS256 (RS4096) with `jose` — 15-min access tokens, 30-day refresh tokens
- Refresh tokens stored as SHA-256 hashes in PostgreSQL; plaintext never persisted
- IP addresses SHA-256+salt hashed before storage (data minimisation)
- OS keychain token storage via `keytar` IPC (never `localStorage`)
- User Service (`services/user/`) — Fastify 5, JWT verification via Auth public-key endpoint (stateless)
  - `GET /user/profiles` — list profiles
  - `POST /user/profiles` — create profile (max 5 per account enforced)
  - `PUT /user/profiles/:id` — update name, avatar, maturity rating, language, autoplay
  - `DELETE /user/profiles/:id` — soft delete

#### Client UI
- Login page with MFA step-up flow (token field auto-shown on `AUTH_MFA_REQUIRED`)
- Register page with password confirm validation
- Profile selection page with avatar initials + colour, kids badge, add-profile card
- Home page placeholder (catalog coming in Phase 2)
- Zustand stores: `auth` (account + active profile), `ui` (sidebar, modals), `player` (playback state)
- TanStack Query client with per-service base URLs, silent token refresh on 401
- Lazy-loaded routes via React `Suspense`

#### Infrastructure & CI/CD
- `docker-compose.yml` — PostgreSQL 16, Redis 7, Redpanda (single-node Kafka), all 6 services
- npm workspaces monorepo: `client/`, `services/*`, `packages/shared`
- `packages/shared` — shared TypeScript types (`ApiResponse`, `AuthTokenPair`, `Profile`, error codes)
- DB migration runner (raw SQL, `services/*/src/db/migrations/0000_initial.sql`)
- `scripts/generate-keys.mjs` — RSA-4096 key generation for JWT signing
- `scripts/setup-dev.sh` — full dev environment bootstrap
- `.github/workflows/service-deploy.yml` — parallel matrix test (6 services) → ECR build → staging deploy → production deploy (manual gate)
- `.github/workflows/electron-release.yml` — cross-platform build on `v*` tags (Windows/macOS/Linux)

### Architecture
- `docs/architecture.md` — BMAD master architecture document (ARCH-001 v1.0.0)
- Polyglot persistence: PostgreSQL (auth schema, user schema) + DynamoDB (Phase 3+) + Redis
- ADRs 001–007 documented and accepted

---

## [0.1.0] — 2026-05-14 — Project Initialisation

### Added
- Repository created with `architecture.md` (ARCH-001 v1.0.0)
- BMAD v6 architecture approved covering all 9 epics
- ADRs accepted: Electron (001), HLS (002), PostgreSQL+DynamoDB (003), JWT RS256 (004), AWS Personalize (005), Kafka MSK (006), Terraform (007)

---

## Upcoming Releases

_All planned epics (1–9) are now shipped in v1.0.0._
