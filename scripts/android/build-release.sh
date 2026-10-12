#!/usr/bin/env bash
# Builds the signed Android App Bundle (.aab) to upload to Google Play.
# Usage: ./scripts/android/build-release.sh [--skip-preflight]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$ROOT_DIR/apps/muse-mobile"
DIST_DIR="$ROOT_DIR/dist"

# Never ship a test-server build ("Muse Test") to Play.
unset EXPO_PUBLIC_TEST_SERVER

if [[ "${1:-}" != "--skip-preflight" ]]; then
  "$ROOT_DIR/scripts/release-preflight.sh" --with-tests
fi

source "$ROOT_DIR/scripts/android/java-env.sh"

cd "$APP_DIR"
npm ci --no-audit --no-fund
npx expo prebuild --platform android --clean --no-install
(cd android && NODE_ENV=production ./gradlew :app:bundleRelease)

if unzip -p android/app/build/outputs/bundle/release/app-release.aab base/assets/app.config | grep -q '"testServer":true'; then
  echo "This bundle was built as a test-server build. Remove EXPO_PUBLIC_TEST_SERVER from your environment and .env files."
  exit 1
fi

VERSION=$(node -e "const c=require('./app.config.js')({config:{}}); console.log(c.version + '-' + c.android.versionCode)")
mkdir -p "$DIST_DIR"
cp android/app/build/outputs/bundle/release/app-release.aab "$DIST_DIR/muse-$VERSION.aab"
echo
echo "Upload this to Play Console: $DIST_DIR/muse-$VERSION.aab"
