# Security Policy

KokoMovie is a local-first desktop application with no account service or hosted application backend. Reports must not include TMDB credentials, token-bearing provider URLs, databases, downloads, or personal data.

## Reporting

Use GitHub's private security-advisory feature. Include the affected version, platform, reproducible steps, impact, and a minimal proof of concept. Do not open a public issue for an unpatched vulnerability. There is currently no guaranteed response-time SLA.

Security fixes target the latest published version.

## Boundaries

The renderer is sandboxed and isolated from Node.js. Privileged operations cross a limited preload/IPC bridge and validate senders and payloads. TMDB credentials use the operating-system keychain. Provider extraction uses hidden isolated sessions with permissions, popups, and downloads denied. Provider and torrent content is untrusted; never submit secrets or personal data to it.
