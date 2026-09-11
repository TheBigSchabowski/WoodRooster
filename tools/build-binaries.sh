#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

APP_VERSION="$(node -p "require('./package.json').version")"
ANDROID_GRADLE="src-tauri/gen/android/app/build.gradle.kts"
DMG="src-tauri/target/release/bundle/dmg/Schachtrainer_${APP_VERSION}_aarch64.dmg"
APK="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
RELEASE_DIR="dist/releases"

if [ ! -f "$ANDROID_GRADLE" ]; then
  echo "Android-Projekt fehlt. Erst ausfuehren:" >&2
  echo "  source tools/android-env.sh && npm run tauri android init" >&2
  exit 1
fi

for resource in \
  src-tauri/resources/openings.pack \
  src-tauri/resources/openings.json; do
  if [ ! -s "$resource" ]; then
    echo "Fehlende oder leere Ressource: $resource" >&2
    echo "Zuerst den Puzzle-Pack erzeugen:  npm run build-pack" >&2
    exit 1
  fi
done

# Bricht ein DMG-Build ab, bleibt sein Arbeitsabbild angehaengt - und genau
# daran scheitert dann der naechste Lauf ("error running bundle_dmg.sh").
echo "==> Loese haengengebliebene DMG-Arbeitsabbilder..."
hdiutil info | awk -v dir="$PWD/src-tauri/target/" '
    index($0, "image-path") == 1 && index($0, dir) && /\/rw\..*\.dmg$/ { found = 1 }
    /^\/dev\/disk/ && found { print $1; found = 0 }' |
  while read -r dev; do
    echo "    $dev"
    hdiutil detach "$dev" -force >/dev/null 2>&1 || true
  done

echo "==> Baue macOS DMG..."
npm run tauri build

echo "==> Baue Android APK..."
# shellcheck source=/dev/null
. tools/android-env.sh
./tools/android-sign.sh
npm run android

for artifact in "$DMG" "$APK"; do
  if [ ! -s "$artifact" ]; then
    echo "Erwartetes Build-Artefakt fehlt: $artifact" >&2
    exit 1
  fi
done

echo "==> Benenne Release-Artefakte..."
mkdir -p "$RELEASE_DIR"
cp "$DMG" "$RELEASE_DIR/Schachtrainer_${APP_VERSION}_macos-arm64.dmg"
cp "$APK" "$RELEASE_DIR/Schachtrainer_${APP_VERSION}_android-arm64.apk"
(
  cd "$RELEASE_DIR"
  shasum -a 256 \
    "Schachtrainer_${APP_VERSION}_macos-arm64.dmg" \
    "Schachtrainer_${APP_VERSION}_android-arm64.apk" > SHA256SUMS.txt
)

echo "==> Builds erfolgreich abgeschlossen!"
cat "$RELEASE_DIR/SHA256SUMS.txt"
echo "Release-Verzeichnis: $RELEASE_DIR"
