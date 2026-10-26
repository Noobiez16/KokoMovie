# `client/release/` — Build Output Folder

This folder holds the packaged desktop installers (`.deb`, `.AppImage`, `.exe`, `.dmg`) produced by `electron-builder`. It is **not** code; it is build output.

## Generation policy

**Do not generate a new release on your own.** Builds in this folder are produced **only when the project owner (Noobiez16) explicitly requests one**, and **with the exact version string the owner provides**.

That means:

- Never bump `client/package.json` or run any `npm run dist:*` script without an explicit instruction.
- Never re-package an existing version — if `KokoMovie-Setup-1.0.3-beta.exe` already exists here and the owner has not asked for a new build, leave it alone.
- Never invent or auto-increment a version (e.g., do **not** decide on `1.0.4-beta` because the changelog has a new entry). The owner names the version.

## Layout

```
client/release/
├── linux/      # .AppImage, .deb, latest-linux.yml, linux-unpacked/
├── windows/    # KokoMovie-Setup-${version}.exe, latest.yml
└── mac/        # KokoMovie-${version}-mac-{x64,arm64}.{dmg,zip}, latest-mac.yml
```

Release output is ignored by Git. Use an isolated working directory/profile for validation; never delete existing artifacts without a requested replacement build.

## When the owner does ask for a build

1. Use the version already authorized by the owner. This release is **v2.1.0**, including the app, changelog and tag.
2. Set that string in `client/package.json` and commit if not already done.
3. Validate the committed preparation branch with workflow_dispatch before creating a release tag.
4. Build:
   - Linux: `npm run dist:linux --workspace=client`
   - Windows (from Linux host): `docker run --rm -v "$PWD":/project -w /project electronuserland/builder:wine npm run dist:win --workspace=client`
   - macOS: `npm run dist:mac:x64 --workspace=client` or `npm run dist:mac:arm64 --workspace=client`, on a matching Mac. These include native LGPL FFmpeg and produce ad-hoc signed DMG/ZIP files.
5. Verify each artifact's filename contains the owner-supplied version before reporting done.

CI stages a `release-ready` bundle only after Windows, Linux x64/ARM64, Mac x64/ARM64 and
artifact assembly succeed. The bundle contains flat checksums, licenses, changelog release
notes, combined Mac metadata and corresponding Mac FFmpeg source. A matching `v2.1.0` tag
publishes it. Mac users may need Gatekeeper approval and install updates manually; no Apple
Developer ID/notarization is claimed.

Mac jobs consume the quality job's checksum-verified source artifact and verify the signed staged application before creating DMG/ZIP archives. Native FFmpeg caches are validated against source/configuration pins before reuse.
