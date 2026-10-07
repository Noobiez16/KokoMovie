# Security Model

## Trust boundaries

The React renderer is untrusted web content without Node.js integration. The preload exposes limited IPC. The main process owns credentials, SQLite, filesystem access, downloads, updates, and provider orchestration. TMDB, GitHub, providers, CDNs, and torrent peers are untrusted networks.

The normal window uses context isolation, sandboxing, web security, no webviews, and no mixed content. Credential and arbitrary-URL IPC validates sender and payload. The API proxy permits GET only to measured TMDB and GitHub API hosts, with restricted headers, timeout, and response-size limits.

In v2.0.0, the production renderer's script policy is `script-src 'self'`; inline
scripts and dynamic evaluation are blocked. Vite embeds the policy into the local HTML
entry, and main applies policy headers only to the trusted main frame. Blob workers are
explicitly permitted for media processing. Development permits Vite's inline/eval/HMR
behavior separately. Style, media, connection and frame origins remain compatible with
existing external providers; they are not limited to a finite provider allowlist by this
change. See [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## Credentials and local data

The TMDB credential is stored for the single local identity in the OS keychain. New plaintext fallback storage is prohibited. A legacy plaintext credential is deleted only after successful keychain migration. Library state and downloads remain on-device; there is no telemetry or analytics. Logs must not contain credentials or token-bearing headers.

## Extraction

Each attempt uses a random ephemeral session and hidden window. Node integration and webviews are disabled; isolation and sandboxing are enabled; permissions, downloads, and popups are denied. Web security is relaxed only in this isolated window because current providers require cross-origin manifest extraction; `FORCE_WEB_SECURITY=true` enables it for testing. Attempts and lifetimes are bounded.

## Filesystem, network, and updates

IPC paths must resolve beneath application-owned roots. Network operations need destination policies and time/size bounds. Loopback media servers bind only to loopback. Release authenticity depends on platform signing and artifact metadata; production releases must document platform limitations and publish checksums.

Torrent download exceptions require the actual bound IPv4 endpoint, a live selected file
and process capability. Cache deletion is restricted to newly registered torrent directories,
with stream/process/store closure awaited first. Download jobs own their children and
published files; cancellation and application quit wait for teardown. Finished portable
files require explicit removal, and unfinished expiry revalidates state before claiming a row.

The normal TMDB repository additionally permits the exact movie/TV watch-provider and
country-list endpoints. Availability links are restricted to the matching HTTPS TMDB title
and country landing page; returned data cannot grant arbitrary navigation or filesystem access.

Windows v2.0.0 source verification produced an unsigned local unpacked package. Its
RunAsNode, NODE_OPTIONS and CLI inspect fuses were disabled and read back from the actual
executable. This does not provide Authenticode authenticity or ASAR-integrity verification;
the existing packaging still uses `asar: false`. Signing and installed upgrade checks require
a separate release operation and signing identity.

## Residual risks

- Provider compatibility currently needs relaxed extraction-window web security.
- Third-party streams, torrents, subtitles, and metadata are hostile inputs.
- Remaining IPC surfaces need progressive schema hardening as Phase 6/7 contracts stabilize.
- Dependency and Electron/Chromium advisories require continuous review.
