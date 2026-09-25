#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_ID="com.muse.app"

log() {
  printf "[fast-loop] %s\n" "$1"
}

log "Running lint + unit tests + typecheck"
npm --prefix apps/muse-mobile run fastcheck

if adb devices | rg -q "emulator-"; then
  SERIAL=$(adb devices | rg "emulator-" | head -n1 | awk '{print $1}')
  log "Launching $APP_ID on emulator $SERIAL"
  adb -s "$SERIAL" shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
  adb -s "$SERIAL" shell am start -n "$APP_ID/.MainActivity" >/dev/null
  sleep 2
  adb -s "$SERIAL" logcat -d | rg -i "FATAL EXCEPTION|AndroidRuntime" || true
else
  log "No emulator detected; skipping emulator smoke run."
fi
