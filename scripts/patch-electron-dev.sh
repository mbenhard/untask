#!/usr/bin/env bash
# Patches the local Electron.app binary for dev mode so macOS shows the
# correct app name and icon in the dock instead of "Electron".
# Runs automatically via postinstall — safe to re-run.

set -euo pipefail

# Resolve through symlinks (pnpm stores the real package elsewhere)
ELECTRON_DIR="$(readlink -f node_modules/electron 2>/dev/null || echo node_modules/electron)"
APP="$ELECTRON_DIR/dist/Electron.app"
PLIST="$APP/Contents/Info.plist"
ICON_SRC="assets/icons/icon.icns"

if [ ! -f "$PLIST" ]; then
  echo "[patch-electron-dev] Electron.app not found, skipping"
  exit 0
fi

# Patch plist: name, identifier, icon
/usr/libexec/PlistBuddy -c "Set :CFBundleName Flusk" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Flusk" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.flusk.dev" "$PLIST" 2>/dev/null || true

# Copy icon into the bundle
if [ -f "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$APP/Contents/Resources/flusk.icns"
  /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile flusk.icns" "$PLIST" 2>/dev/null || true
fi

# Re-sign with ad-hoc signature (plist edits invalidate the original)
codesign --force --deep --sign - "$APP" 2>/dev/null || true

# Touch the bundle so macOS re-reads metadata
touch "$APP"

echo "[patch-electron-dev] Patched Electron.app → Flusk"
