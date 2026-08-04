# Legal and Third-Party Services

KokoMovie is an independent local media browser and player. It does not host or operate catalog or streaming infrastructure. Users are responsible for law, service terms, content licenses, and geographic restrictions.

## TMDB

This product uses the TMDB API but is not endorsed or certified by TMDB.

Users supply their credential and remain subject to TMDB terms. Attribution appears in Settings next to API Configuration.

## Providers, torrents, and downloads

Providers, CDNs, subtitle sources, torrent indexes, and peers are independent third parties. Availability, safety, accuracy, and authorization are not guaranteed. Do not access or distribute material without permission.

## FFmpeg and project license

KokoMovie is licensed **GPL-3.0-or-later** (`LICENSE`). Both `package.json` manifests declare it and
`npm run check:licenses` enforces it.

The bundled FFmpeg executable is an **LGPL-3.0-or-later** build (BtbN/FFmpeg-Builds, release
`autobuild-2026-08-03-14-02`, FFmpeg `n8.1.2`). It replaces the former `ffmpeg-static` dependency,
whose binary was configured `--enable-gpl --enable-version3`. FFmpeg is spawned as a separate
executable and never linked, and every GPL-only component is disabled in the build.

Obligations satisfied for each release:

- KokoMovie's corresponding source is published in this repository.
- The FFmpeg licence text ships at `resources/ffmpeg/LICENSE.txt` in every installer, with
  `resources/ffmpeg/PROVENANCE.json` recording the upstream URL, SHA-256, and configure line.
- FFmpeg's corresponding source is available from BtbN/FFmpeg-Builds and ffmpeg.org.
- The executable is installed outside `app.asar` so users can replace it (LGPL §4).

macOS is build-only and no LGPL FFmpeg binary is vendored for it; a macOS build must source and
verify one before that platform ships. See `THIRD-PARTY-NOTICES.md`. This is not legal advice.
