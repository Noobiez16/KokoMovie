#!/usr/bin/env bash
# Generate all platform icon formats from a single 1024×1024 source PNG.
# Usage: bash build/generate-icons.sh <path-to-source-1024.png>
#
# Dependencies:
#   macOS: brew install imagemagick  (provides 'magick' / 'convert')
#   Linux: sudo apt install imagemagick
#   Windows: install ImageMagick from https://imagemagick.org
#
# For .icns (macOS):  requires 'png2icns' — brew install libicns
# For .ico (Windows): ImageMagick handles this natively

set -euo pipefail

SOURCE="${1:-}"
if [ -z "$SOURCE" ]; then
  echo "Usage: bash build/generate-icons.sh <source-1024px.png>"
  exit 1
fi

ICONS_DIR="$(dirname "$0")/icons"
mkdir -p "$ICONS_DIR"

echo "Generating icons from: $SOURCE"
echo "Output directory:      $ICONS_DIR"

# ── Linux PNG sizes ──────────────────────────────────────────────────────────
for size in 16 32 48 64 128 256 512 1024; do
  convert "$SOURCE" -resize "${size}x${size}" "$ICONS_DIR/${size}x${size}.png"
  echo "  Created ${size}x${size}.png"
done

# ── Windows .ico (multi-resolution) ─────────────────────────────────────────
convert "$SOURCE" \
  \( -clone 0 -resize 16x16   \) \
  \( -clone 0 -resize 24x24   \) \
  \( -clone 0 -resize 32x32   \) \
  \( -clone 0 -resize 48x48   \) \
  \( -clone 0 -resize 64x64   \) \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 256x256 \) \
  -delete 0 "$ICONS_DIR/icon.ico"
echo "  Created icon.ico"

# ── macOS .icns ───────────────────────────────────────────────────────────────
if command -v png2icns &>/dev/null; then
  png2icns "$ICONS_DIR/icon.icns" \
    "$ICONS_DIR/16x16.png" \
    "$ICONS_DIR/32x32.png" \
    "$ICONS_DIR/48x48.png" \
    "$ICONS_DIR/128x128.png" \
    "$ICONS_DIR/256x256.png" \
    "$ICONS_DIR/512x512.png"
  echo "  Created icon.icns"
else
  # Fallback: use iconutil on macOS
  if command -v iconutil &>/dev/null; then
    ICONSET="$ICONS_DIR/icon.iconset"
    mkdir -p "$ICONSET"
    convert "$SOURCE" -resize 16x16     "$ICONSET/icon_16x16.png"
    convert "$SOURCE" -resize 32x32     "$ICONSET/icon_16x16@2x.png"
    convert "$SOURCE" -resize 32x32     "$ICONSET/icon_32x32.png"
    convert "$SOURCE" -resize 64x64     "$ICONSET/icon_32x32@2x.png"
    convert "$SOURCE" -resize 128x128   "$ICONSET/icon_128x128.png"
    convert "$SOURCE" -resize 256x256   "$ICONSET/icon_128x128@2x.png"
    convert "$SOURCE" -resize 256x256   "$ICONSET/icon_256x256.png"
    convert "$SOURCE" -resize 512x512   "$ICONSET/icon_256x256@2x.png"
    convert "$SOURCE" -resize 512x512   "$ICONSET/icon_512x512.png"
    convert "$SOURCE" -resize 1024x1024 "$ICONSET/icon_512x512@2x.png"
    iconutil -c icns "$ICONSET" -o "$ICONS_DIR/icon.icns"
    rm -rf "$ICONSET"
    echo "  Created icon.icns (via iconutil)"
  else
    echo "  WARN: Skipped icon.icns — install png2icns (brew install libicns) or run on macOS for iconutil"
  fi
fi

echo ""
echo "Done! Place a 1024×1024 source PNG at the path you passed and re-run if needed."
echo "Required files for electron-builder:"
echo "  client/build/icons/icon.ico    (Windows)"
echo "  client/build/icons/icon.icns   (macOS)"
echo "  client/build/icons/512x512.png (Linux AppImage)"
