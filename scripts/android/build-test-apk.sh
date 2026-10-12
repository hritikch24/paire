#!/usr/bin/env bash
# Builds "Muse Test": an APK for your test group that talks to the test server on
# this Mac (./scripts/test-backend.sh), never to production. It installs beside
# the Play version (package com.muse.app.test) and is meant for sideloading only.
# Output: dist/Muse-Test.apk, which the test server offers on its invite page.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$ROOT_DIR/apps/muse-mobile"
DIST_DIR="$ROOT_DIR/dist"

source "$ROOT_DIR/scripts/android/java-env.sh"

cd "$APP_DIR"
[[ -d node_modules ]] || npm ci --no-audit --no-fund

restore_native_project() {
  # Leave android/ as the normal app so later builds aren't test builds by accident.
  echo "Restoring the regular Android project..."
  env -u EXPO_PUBLIC_TEST_SERVER npx expo prebuild --platform android --clean --no-install >/dev/null
}
trap restore_native_project EXIT

export EXPO_PUBLIC_TEST_SERVER=true
npx expo prebuild --platform android --clean --no-install
(cd android && NODE_ENV=production ./gradlew --no-daemon :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a)

APK="android/app/build/outputs/apk/release/app-release.apk"
APP_CONFIG="$(unzip -p "$APK" assets/app.config)"
if [[ "$APP_CONFIG" != *'"testServer":true'* || "$APP_CONFIG" != *'"package":"com.muse.app.test"'* ]]; then
  echo "The built app isn't a complete test-server build. Not copying it."
  exit 1
fi

mkdir -p "$DIST_DIR"
cp "$APK" "$DIST_DIR/Muse-Test.apk"
echo
echo "Built $DIST_DIR/Muse-Test.apk"
echo "Start (or restart) ./scripts/test-backend.sh and share the invite link: it offers this APK."
