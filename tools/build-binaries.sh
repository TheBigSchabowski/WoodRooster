#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Baue macOS DMG..."
npm run tauri build

echo "==> Baue Android APK..."
# shellcheck source=/dev/null
. tools/android-env.sh
npm run android

echo "==> Builds erfolgreich abgeschlossen!"
echo "macOS DMG: src-tauri/target/release/bundle/dmg/"
echo "Android APK: src-tauri/gen/android/app/build/outputs/apk/universal/release/"
