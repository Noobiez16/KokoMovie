# DoNot.md — Lessons Learned (Do Not Repeat)

A living document of bugs that were fixed and **why they worked after the fix**. Before making changes to any of the areas listed below, read the corresponding entry to avoid reintroducing the same bug.

---

## DN-001: VideoPlayer must handle both HLS and direct video URLs

**Date:** 2026-05-19  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** Stream found successfully, player opens, but video stays black at 0:00 / 0:00.  
**Root cause:** The stream extractor (`stream-extractor/index.ts`) captures `.mp4` and `.webm` URLs in addition to `.m3u8` manifests. But `VideoPlayer` always fed every URL to hls.js, which can only parse HLS manifests. Feeding it an MP4 caused a silent failure.  
**Fix:** Detect the URL extension before initializing playback. If it ends in `.mp4`, `.webm`, or `.mkv`, set `video.src` directly (native Chromium playback). Only use hls.js for actual HLS streams. Additionally, if hls.js encounters an unrecoverable error, fall back to native `video.src` as a last resort instead of immediately showing an error.

**DO NOT:**
- Remove the `isDirectVideo` check in the HLS init `useEffect`
- Assume all stream URLs are HLS manifests
- Remove the native fallback in the hls.js fatal error handler

---

## DN-002: GitHub Actions `secrets` context cannot be used in job-level `if:`

**Date:** 2026-05-19  
**Area:** `.github/workflows/service-deploy.yml`  
**Symptom:** Workflow fails to parse at all — "Unrecognized named-value: 'secrets'"  
**Root cause:** GitHub Actions only exposes the `secrets` context inside `steps[*].if` and step-level expressions. Using `secrets.AWS_ACCESS_KEY_ID` in a job-level `if:` causes a YAML parse failure before any job runs.  
**Fix:** Removed the build-push and deploy jobs entirely since AWS infrastructure is not provisioned. When AWS is set up, gate with an environment check or `workflow_dispatch`, not job-level `secrets.*`.

**DO NOT:**
- Reference `secrets.*` in job-level `if:` conditions
- Add `continue-on-error: true` as a substitute — it still shows red X marks

---

## DN-003: `billing` service was removed — do not reference it anywhere

**Date:** 2026-05-19  
**Area:** `.github/workflows/`, `infra/terraform/`, `services/`  
**Symptom:** CI test matrix included `billing`, causing `npm ci` to fail because the workspace doesn't exist. Terraform validate failed because ECS/ECR/MSK configs referenced a billing container.  
**Root cause:** The billing service was removed from `services/` but references persisted in CI matrix arrays, Terraform `locals.services`, ECR module service lists, ECS route maps, and MSK topic definitions.  
**Fix:** Grep for `billing` across the entire repo and removed all references.

**DO NOT:**
- Add `billing` back to any CI matrix, Terraform config, or Docker deployment loop
- Create a `services/billing` directory without also adding it to the CI matrix and Terraform configs

---

## DN-004: `package-lock.json` must stay in sync with workspaces

**Date:** 2026-05-19  
**Area:** Root `package.json` + `package-lock.json`  
**Symptom:** All GitHub Actions fail with "npm ci can only install packages when package.json and package-lock.json are in sync"  
**Root cause:** Adding or removing workspaces (e.g., removing billing) without running `npm install` leaves the lockfile referencing packages that no longer exist.  
**Fix:** Always run `npm install` after any workspace change to regenerate the lockfile.

**DO NOT:**
- Push changes that add/remove npm workspaces without running `npm install` first
- Manually edit `package-lock.json`

---

## DN-005: Provider registry order matters for stream racing

**Date:** 2026-05-19  
**Area:** `client/src/main/providers/registry.ts`  
**Symptom:** Slow or no streams found despite having many providers.  
**Root cause:** The `ALL_PROVIDERS` array order determines batch priority. The staggered parallel racer (batches of 4, 1.5s stagger) starts from index 0. If unreliable providers are first, the first batch wastes time.  
**Fix:** Order providers by reliability — VidBinge and VidSrc first, experimental ones last.

**DO NOT:**
- Add new providers at the top of `ALL_PROVIDERS` without testing their reliability
- Reorder providers without understanding the batch racing logic in `ipc/providers.ts`

---

## DN-006: CSP `frame-src` must allow YouTube for hero trailers

**Date:** 2026-05-19  
**Area:** `client/src/main/index.ts` (CSP headers)  
**Symptom:** Hero banner YouTube trailers fail to load silently.  
**Root cause:** Setting `frame-src 'none'` blocks the YouTube embed iframes used for background hero trailers on the browse page.  
**Fix:** Production CSP includes `frame-src 'self' https://*.youtube.com https://*.youtube-nocookie.com https://*.ytimg.com https:`

**DO NOT:**
- Set `frame-src 'none'` in the CSP
- Remove YouTube domains from `frame-src`

---

## DN-007: CAM/Telesync streams must be filtered at the extractor level

**Date:** 2026-05-19  
**Area:** `client/src/main/stream-extractor/index.ts`  
**Symptom:** Low quality theater-recorded (CAM) or telesync audio streams play instead of proper HD releases.  
**Root cause:** Without filtering, the first stream URL found wins — including CAM rips.  
**Fix:** `isCamStream()` checks URL path segments and query params for cam/telesync indicators and skips those URLs. The extractor continues looking for a legitimate stream.

**DO NOT:**
- Remove the `isCamStream()` check
- Add CAM-related patterns to the allowed list

---

## DN-008: Stream URLs MUST use local HTTP proxy — CORS kills playback

**Date:** 2026-05-19  
**Area:** `client/src/main/index.ts`, `client/src/main/ipc/providers.ts`  
**Symptom:** Stream found successfully (extraction log shows SUCCESS + URL), player opens with correct title, but video stays black at 0:00/0:00.  
**Root cause:** Stream CDNs don't return `Access-Control-Allow-Origin` headers. hls.js in the renderer runs inside Chromium with `webSecurity: true`, which enforces CORS. When hls.js fetches the HLS manifest via `XMLHttpRequest`, Chromium blocks it.
**Why custom protocols (`stream://`) didn't work:** Even with `corsEnabled: false`, Chromium's XHR engine (used internally by hls.js) handles custom schemes unreliably and often drops them. Additionally, manifests contain absolute `https://` paths for segments that bypass custom schemes.  
**Fix (Architecture):** 
1. **Local HTTP Proxy:** The main process runs a lightweight HTTP server (`startStreamProxy()` on `localhost:PORT`) before creating the window. The proxy forwards requests using `net.fetch` (Node.js network stack, immune to CORS).
2. **Forbidden Fetch Headers:** The proxy explicitly strips forbidden headers (like `Sec-Fetch-Site`) because `net.fetch` will crash with `net::ERR_INVALID_ARGUMENT` if they are manually injected into the `Headers` object. It also extracts `Referer` to pass it securely as an option.
3. **M3U8 URL Rewriting:** The proxy intercepts `.m3u8` responses and uses regex to rewrite both absolute paths (`/path/seg.ts`) and full URLs (`https://.../seg.ts`) to point back to the local `/proxy/...` endpoint. Without this, hls.js would resolve absolute URLs out to the raw internet, immediately hitting a 404 or CORS block.
4. **CSP:** The renderer's Content Security Policy allows `media-src http://localhost:*`.

**DO NOT:**
- Remove the `startStreamProxy()` startup call in `index.ts`
- Attempt to switch back to a custom `stream://` protocol
- Remove the `.m3u8` text-rewriting logic inside the proxy handler (otherwise manifests with absolute paths will bypass the proxy and trigger CORS)
- Set forbidden fetch headers (like `Referer` or `Sec-*`) directly into the `headers` object of `net.fetch` — they must be filtered out or passed via native `fetch` options.

---

## DN-009: Quality-Aware Racing must be used instead of First-Winner Racing

**Date:** 2026-05-20  
**Area:** `client/src/main/ipc/providers.ts`  
**Symptom:** Quality is poor (360p or 720p) even if high quality providers are enabled and content is available in 1080p.  
**Root cause:** Staggered parallel racing terminates as soon as the first stream is found. While this maximizes speed, fast low-quality mirrors (like VidSrc.pm) return low-resolution streams (max 720p or 360p) and abort slower providers (like VidSrc/VidLink) that have 1080p.  
**Fix:**
1. **Quality Detection:** Use `getMaxResolution` inside the main process to fetch the manifest and inspect resolutions prior to terminating.
2. **Quality-Aware Race:**
   - If a provider returns a stream >= 1080p, resolve immediately.
   - If a provider returns a stream < 1080p (e.g. 720p), save it as `bestResult` and start a 3.5s fallback timer, letting other workers run. If another worker finds a 1080p stream during this window, resolve with the 1080p stream. Otherwise, fall back to the best stream found.
3. **Proxy Manifest Filtering:** Filter out resolutions < 720p from HLS master playlists in the proxy if higher-quality options are available, forcing `hls.js` to play at 720p or 1080p instead of starting at 360p.

**DO NOT:**
- Remove the `getMaxResolution` check or the quality-wait timer in `getFirstStream`
- Return the first stream instantly without checking its quality, unless it's >= 1080p
- Filter out low qualities in the proxy if *only* low qualities are available (the proxy only filters < 720p if resolutions >= 720p are present in the manifest)

---

## DN-010: Aspect-Ratio and Header-Safe Quality Checks (Widescreen + Proxy Fetching via fetchNode)

**Date:** 2026-05-20  
**Area:** `client/src/main/ipc/providers.ts`, `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** High-quality streams (like VidLink) get assigned `Resolution: 0p` and lose the race, or widescreen streams (e.g. `1280x536` or `1920x800`) are incorrectly filtered out or fail to map to 720p/1080p in the player controls, or proxying segments fails with Cloudflare 403 blocks.
**Root cause:** 
1. **Forbidden Header / CORS Fetch Failure:** Fetching stream URLs directly inside the main process with Electron's `net.fetch` strips forbidden headers like `Referer` and `Origin` from the outgoing headers. CDNs like Cloudflare block these requests with a 403 error.
2. **Session Interceptor Bypass:** While `session.defaultSession.webRequest.onBeforeSendHeaders` can inject headers for renderers, `net.fetch` requests originating in the main process do not trigger these handlers consistently.
3. **Non-Standard Aspect Ratios:** Movies use cinema aspect ratios (e.g., 2.39:1). A 1080p stream might be `1920x800` or `1920x816`, and a 720p stream might be `1280x536`. Strict checks on vertical height (like `height < 720`) mistakenly classify widescreen 720p streams as low-resolution, and fail to immediately resolve on widescreen 1080p streams (since height is < 1080).
**Fix:**
1. **Node http/https fetcher (fetchNode):** Implemented a custom Node-level fetcher (`fetchNode`) using raw `http` and `https` modules to bypass Electron's `net.fetch` restrictions. This allows injecting `Referer`, `Origin`, and any custom headers flawlessly, preventing Cloudflare 403 blocks.
2. **Proxy integration:** The proxy server uses `fetchNode` to perform all proxy fetches for manifests and chunks, guaranteeing correct headers.
3. **Standard-height helper:** Implement `getStandardHeight(width, height)` to map cinema resolutions to standard heights (e.g., width 1920 or height 1080 maps to standard 1080; width 1280 or height 720 maps to standard 720).
4. **UI levels mapping:** Map the parsed HLS heights to standard heights in the renderer so the user sees proper quality labels (`720p`, `1080p`) instead of `536p` or `800p`.

**DO NOT:**
- Use Electron's `net.fetch` for proxying or checking resolutions where custom/forbidden headers (like `Referer` or `Origin`) are required.
- Fetch raw URLs in `getMaxResolution` directly without going through `toProxyUrl` or registering headers first.
- Enforce strict height checks without checking the corresponding width (always use `getStandardHeight`).
- Show cinema aspect ratio resolutions (like `536p` or `800p`) in the player quality selector.

---

## DN-011: Segment files must use direct chunk piping; subtitles must be converted to WebVTT format on-the-fly

**Date:** 2026-05-20  
**Area:** `client/src/main/ipc/providers.ts`, `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** Playing movie or series stutters or lags for several seconds continuously even on high-speed internet connections, or external SRT subtitles fail to render on the video.  
**Root cause:**  
1. **Memory Buffering Lag:** The local HTTP proxy previously fetched the entire media segment (`.ts` or `.mp4` chunks) into a buffer in memory using `fetchNode` before responding to the client. This loading delay caused latency spikes, micro-stutters, and video player stalls.  
2. **Subtitle Format Incompatibility:** Sideloaded subtitles from OpenSubtitles are fetched in SRT format, but the native Chromium browser video player only renders WebVTT format (`.vtt`) via `<track>` elements.
**Fix:**  
1. **Direct Segment Piping:** Modified the local HTTP proxy to check if a request is a segment chunk (not `.m3u` or `.m3u8` and not subtitle format request). If so, it bypasses memory buffering and streams/pipes chunks (`streamSegment`) immediately to the player as they arrive.  
2. **On-the-Fly SRT to WebVTT Converter:** Added a format converter in the proxy. If `format=vtt` query parameter is present, the proxy fetches the SRT subtitle file, replaces the comma timestamp delimiters with periods, prepends `WEBVTT`, and serves it back as `text/vtt`.  
3. **Buffer and ABR Tuning:** Set Hls.js buffer capacity to `150MB` and start level selection using `hls.nextLevel` so the player starts at the highest resolution but can auto-switch down if needed, preventing hangs.

**DO NOT:**
- Buffer full segment chunk payloads in memory before responding to client requests.
- Attempt to sideload raw SRT files directly to the video element without converting them to WebVTT first.
- Lock `hls.currentLevel` on initial load when in Auto mode, which overrides Hls.js's adaptive quality switching.

---

## DN-012: YouTube/GoogleVideo domains must be blocked in the stream extractor

**Date:** 2026-05-20  
**Area:** `client/src/main/stream-extractor/index.ts`  
**Symptom:** Clicking play on a TV series episode (e.g., The Boys S1E1) plays a random YouTube trailer or ad instead of the actual episode. Extraction log shows `googlevideo.com` URLs captured as the "stream."  
**Root cause:** Provider embed pages sometimes load YouTube trailers or pre-roll ads. YouTube video URLs match `.mp4`/`.webm` stream patterns and their responses include `video/mp4` or `video/webm` Content-Types. The extractor captured these before the real provider stream could load.  
**Fix:**  
1. Added `youtube.com`, `googlevideo.com`, `ytimg.com`, `youtube-nocookie.com` to `BLOCKED_HOSTS` so their requests are cancelled before they load.  
2. Added hostname checks in both `isStreamUrl()` and `onHeadersReceived()` to reject any URL from these domains, even if the path or content type matches stream patterns.  

**DO NOT:**
- Remove YouTube/Google Video domains from `BLOCKED_HOSTS`
- Remove the hostname guard in `isStreamUrl()` or `onHeadersReceived()`
- Confuse this with the CSP `frame-src` rule (DN-006) — the hero banner YouTube iframes run in the **renderer**, which needs YouTube allowed. The **stream extractor** is a separate hidden BrowserWindow where YouTube must be blocked.

---

## DN-013: Refresh tokens must use OS keychain or in-memory temp storage — never localStorage

**Date:** 2026-05-20  
**Area:** `client/src/main/ipc/auth.ts`, `client/src/renderer/hooks/useAuth.ts`, `client/src/renderer/components/auth/LoginForm.tsx`  
**Symptom:** User has to re-enter credentials on every app restart.  
**Root cause:** Refresh tokens were stored in OS keychain via `keytar` but the Zustand auth store was persisted to `localStorage`. On restart, `localStorage` showed `isAuthenticated: true` but `keytar` had no refresh token (or the token was expired). The silent refresh failed, leaving the user stranded.  
**Fix:**  
1. Auth store already persists `isAuthenticated` and `account` to `localStorage` (Zustand `persist` middleware). This is fine — it's metadata, not secrets.  
2. Refresh tokens stay in `keytar` (persistent) or a module-level `tempRefreshToken` variable (session-only when "Stay signed in" is unchecked).  
3. `setRefreshToken` IPC handler accepts an optional `persist: boolean` parameter. When `false`, the token is stored in memory only and any keytar/fallback entry is deleted.  
4. Login form includes a "Stay signed in" checkbox (default: checked). The value is passed through the mutation → `setRefreshToken(token, persist)`.  

**DO NOT:**
- Store refresh tokens in `localStorage` — that violates the security architecture (see `docs/architecture.md` §8).
- Remove the `tempRefreshToken` fallback — without it, non-persistent sessions lose the refresh token entirely.
- Remove the `persist` default (`true`) in the preload bridge — silent refresh and token rotation calls don't pass persist explicitly and must default to persistent.

---

## DN-014: Subtitle tracks must be deduplicated and exclusively activated to prevent double rendering

**Date:** 2026-05-20 (updated 2026-05-20)
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`, `PlayerControls.tsx`  
**Symptom:** Subtitles appear doubled/stacked — two overlapping copies of the same subtitle text render simultaneously on the video.  
**Root cause:**  
1. **Language code mismatch in deduplication:** The deduplication used `.slice(0, 2)` on raw lang codes. `'spa'.slice(0, 2)` = `'sp'`, not `'es'`. So when an external sub has `lang='es'` and the internal HLS track has `lang='spa'`, they were NOT considered duplicates, and both appeared.  
2. **HLS `subtitleDisplay` not disabled for external tracks:** When an external sideload track was selected, `hls.subtitleDisplay` remained `true`, allowing hls.js to re-render its own internal track concurrently.  
3. **`updateTracks` race for internal HLS tracks:** When an internal HLS track (id 0–999) was selected, `extTrack` lookup returned `undefined` (because internal tracks aren't in `externalSubs`), so the code disabled ALL tracks including the HLS-managed one. HLS.js then re-enabled its own track, creating a race condition with any external `<track>` that was still partially active.

**Fix:**  
1. **`normalizeLang` helper:** Maps ISO 639-2 (3-letter) codes to ISO 639-1 (2-letter): `spa→es`, `eng→en`, `fra→fr`, etc. Use it everywhere for language comparison, not `.slice(0, 2)`.  
2. **`hls.subtitleDisplay = false`** when selecting external tracks or turning off. `hls.subtitleDisplay = true` when selecting internal HLS tracks.  
3. **Three-case `updateTracks`:**  
   - `currentSubtitle === -1` (off): disable all `textTracks`.  
   - `currentSubtitle >= 1000` (external): enable matching `<track>`, disable ALL others including internal HLS.  
   - `currentSubtitle 0–999` (internal HLS): only disable external `<track>` elements (identified by IDs in `extIdSet`); do not touch HLS-managed tracks — hls.js owns them.  
4. **`background-color` not `background` in `::cue` CSS:** The `background` shorthand is not reliably supported in `::cue`; use `background-color` explicitly.

**DO NOT:**
- Use `.slice(0, 2)` for language code comparison — use `normalizeLang()`.
- Leave `hls.subtitleDisplay = true` when switching to external or off — hls.js will race to re-show its internal track.
- Disable ALL `textTracks` when an internal HLS track is selected — hls.js manages those tracks and will fight you.
- Remove the language-based deduplication in `subtitleTracks` — without it, the CC menu shows two entries for the same language.

---

## DN-015: Episode season number must be passed explicitly to the stream request — do not re-derive from DB lookup

**Date:** 2026-05-20  
**Area:** `client/src/renderer/pages/ContentDetail.tsx`  
**Symptom:** Clicking Season 1 Episode 1 in the episode list plays content from a completely different season (e.g., Season 3).  
**Root cause:** `handleAutoStream` accepted only an `Episode` object and derived the season by searching `c.seasons` (raw, unsorted, from the API response) for a matching episode ID. If the DB has episodes stored under the wrong season (a TMDB sync data issue), or if seasons are returned in an unexpected order, `season.seasonNumber` reflects the incorrect DB association.  
**Fix:** Accept an explicit `seasonNumber?: number` parameter in `handleAutoStream`. The call sites always know which season is being displayed (`season = sortedSeasons[selectedSeason]`), so pass `season?.seasonNumber` directly. The DB lookup is only used as a fallback when `seasonNumber` is not provided.

**DO NOT:**
- Search `c.seasons` or `sortedSeasons` to look up which season an episode belongs to when the call site already knows the season.
- Pass just the `Episode` object without its season context when both are available.

---

## DN-016: hd4u.sbs is VidSrc.rip's player domain — never add it to BLOCKED_HOSTS

**Date:** 2026-05-20  
**Area:** `client/src/main/stream-extractor/index.ts`  
**Symptom:** VidSrc.rip always fails extraction. Logs show `ERR_BLOCKED_BY_CLIENT` for `hd4u.sbs`.  
**Root cause:** `hd4u.sbs` was added to `BLOCKED_HOSTS`. VidSrc.rip's embed page redirects to `https://hd4u.sbs/#...` (its video player). When `onBeforeRequest` cancels that navigation, the extractor never loads the player and can't intercept any stream URL.  
**Fix:** Removed `hd4u.sbs` from `BLOCKED_HOSTS`. Added an explanatory comment so it's never re-added by mistake.

**DO NOT:**
- Add `hd4u.sbs` back to `BLOCKED_HOSTS` — it is a legitimate stream player, not an ad domain.

---

## DN-017: Dead provider domains must be disabled by default, not left enabled to time out every race

**Date:** 2026-05-20  
**Area:** `client/src/main/providers/embedsu.ts`, `client/src/main/providers/registry.ts`  
**Symptom:** Console floods with `ERR_NAME_NOT_RESOLVED` for `embed.su`. Stream races take longer because a dead provider holds one of the 4 parallel batch slots for the full timeout duration.  
**Root cause:** `embed.su` domain no longer resolves (DNS dead). Provider was still in the registry and enabled by default, so every race attempt wasted time on it.  
**Fix:** Added `defaultEnabled?: boolean` to the `Provider` interface. Set `embedSuProvider.defaultEnabled = false`. Registry uses `p.defaultEnabled ?? true` as the fallback when no user preference exists.

**DO NOT:**
- Enable dead providers by default.
- Remove a dead provider from the registry entirely — keep it with `defaultEnabled: false` so users can manually re-enable it if the domain revives.

---

## DN-018: Never add a 10-second auto-skip at playback start

**Date:** 2026-05-20  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** User clicks Episode 1 but the video appears to start at a scene from the middle of the episode. Playback is disorienting — the opening credits or cold-open are completely skipped.  
**Root cause:** An auto-skip was added to jump past "pre-roll ads" by unconditionally seeking to `currentTime = 10` whenever the first `timeupdate` event fired with `currentTime < 1`. This fires on **every** provider stream, including streams that have no pre-roll ads. The 10-second jump also doesn't work as an ad-skip — it lands inside the actual episode content, not past any ad.  
**Fix:** Removed the auto-skip entirely. If a specific provider is observed to have consistent pre-roll ads, the correct fix is to either block the ad network domain in `BLOCKED_HOSTS` or add explicit detection logic for that provider's ad URL pattern.

**DO NOT:**
- Add any unconditional `video.currentTime = N` seek at playback start.
- Assume all provider streams have pre-roll ads of a known duration.

---

## DN-020: `allStreams` must be declared in VideoPlayer's Props interface — never silently drop pre-extracted streams

**Date:** 2026-05-20  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`, `client/src/renderer/pages/Player.tsx`  
**Symptom:** Every source switch in the player shows "Provider returned no working stream" or times out after 20s, even though the initial race successfully collected streams from multiple providers.  
**Root cause:** `Player.tsx` passed `allStreams` (an array of pre-extracted provider streams) as a JSX prop to `<VideoPlayer>`. The `VideoPlayer` `Props` interface did not declare `allStreams`, so TypeScript treated it as an extra prop and React silently discarded it. `handleSourceChange` then attempted a live extraction for every switch attempt — most fail because the extraction window takes 12–30s and many providers are inconsistent.  
**Fix:**  
1. Added `allStreams?: CachedStream[]` to the `Props` interface in `VideoPlayer.tsx`.  
2. `handleSourceChange` checks `allStreams` first; if the target provider already has a cached stream, it applies it immediately (zero IPC calls).  
3. Providers absent from `allStreams` still trigger a fresh extraction as a fallback.  

**DO NOT:**
- Pass a prop to a React component without declaring it in that component's `Props` interface — TypeScript will not error on extra props by default.
- Re-extract a stream that was already collected during the initial provider race; use the cached result in `allStreams`.
- Assume that because `sources.length > 1` is true, all those sources are reachable — only providers in `allStreams` are confirmed working for this specific content.

---

## DN-019: `hostResolutionCache` in stream extractor must use a TTL — never persist indefinitely

**Date:** 2026-05-20  
**Area:** `client/src/main/stream-extractor/index.ts`  
**Symptom:** After a transient DNS failure (e.g., a CDN is briefly unreachable), that CDN host remains permanently blocked for the rest of the app session. Providers using that CDN always time out silently even after the CDN recovers.  
**Root cause:** `hostResolutionCache` was a plain `Map<string, boolean>` with no expiration. Once a host was marked `false` (DNS failed), it stayed `false` forever.  
**Fix:** Changed to `Map<string, { ok: boolean; expiresAt: number }>` with a 3-minute TTL (`HOST_RESOLUTION_TTL_MS`). Cached entries are re-checked after TTL expires.

**DO NOT:**
- Replace the TTL-aware cache with a plain boolean `Map` — transient failures would permanently blacklist legitimate CDN hosts.
- Set the TTL so long (e.g., hours) that a recovered CDN still gets blocked for the entire session.
