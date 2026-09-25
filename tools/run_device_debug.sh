#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_ROOT="$ROOT_DIR/artifacts"
RUN_DIR="$ARTIFACTS_ROOT/$(date +%Y-%m-%d_%H-%M-%S)-device-debug"
MOBILE_DIR="$ROOT_DIR/apps/muse-mobile"
ANDROID_DIR="$MOBILE_DIR/android"
APP_ID="com.muse.app"
MAIN_ACTIVITY="com.muse.app/.MainActivity"
PACKAGER_PORT="${MUSE_PACKAGER_PORT:-8081}"

mkdir -p "$RUN_DIR"

log() {
  printf "[%s] %s\n" "$(date +%H:%M:%S)" "$*" | tee -a "$RUN_DIR/device-debug.log" >&2
}

set_default_env() {
  if [[ -z "${ANDROID_HOME:-}" && -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  fi
  if [[ -x "$HOME/Applications/temurin-17/Contents/Home/bin/java" ]]; then
    export JAVA_HOME="$HOME/Applications/temurin-17/Contents/Home"
    export PATH="$JAVA_HOME/bin:$PATH"
  elif [[ -x /usr/libexec/java_home ]]; then
    JAVA_HOME_17="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
    if [[ -n "$JAVA_HOME_17" ]]; then
      export JAVA_HOME="$JAVA_HOME_17"
      export PATH="$JAVA_HOME/bin:$PATH"
    fi
  fi
  if [[ -n "${ANDROID_HOME:-}" && -x "$ANDROID_HOME/platform-tools/adb" ]]; then
    export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
  fi
}

pick_device() {
  if [[ -n "${MUSE_DEVICE:-}" ]]; then
    echo "$MUSE_DEVICE"
    return 0
  fi
  adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}'
}

start_packager() {
  if curl -s "http://127.0.0.1:${PACKAGER_PORT}/status" | grep -q "packager-status:running"; then
    log "Metro already running on port ${PACKAGER_PORT}"
    return 0
  fi
  log "Starting Metro on port ${PACKAGER_PORT}"
  EXPO_NO_INTERACTIVE=1 nohup npm --prefix "$MOBILE_DIR" run start -- --dev-client --port "$PACKAGER_PORT" \
    >"$RUN_DIR/metro.log" 2>&1 &
  sleep 3
  if ! curl -s "http://127.0.0.1:${PACKAGER_PORT}/status" | grep -q "packager-status:running"; then
    log "WARNING: Metro not responding on port ${PACKAGER_PORT}. Check $RUN_DIR/metro.log"
  fi
}

set_default_env

if ! command -v adb >/dev/null 2>&1; then
  log "ERROR: adb not found. Install Android SDK platform-tools or set ANDROID_HOME."
  exit 1
fi

DEVICE="$(pick_device)"
if [[ -z "$DEVICE" ]]; then
  log "ERROR: No physical device found. Set MUSE_DEVICE or connect via adb."
  exit 1
fi

log "Using device: $DEVICE"
start_packager

log "Setting adb reverse for Metro"
adb -s "$DEVICE" reverse "tcp:${PACKAGER_PORT}" "tcp:${PACKAGER_PORT}" || true

if [[ "${MUSE_INSTALL:-true}" == "true" ]]; then
  log "Installing debug APK"
  (cd "$ANDROID_DIR" && ./gradlew installDebug) >"$RUN_DIR/gradle-installDebug.log" 2>&1
fi

log "Launching app"
adb -s "$DEVICE" shell am start -n "$MAIN_ACTIVITY" >"$RUN_DIR/am-start.log" 2>&1 || true

log "Capturing logcat for 30 seconds"
adb -s "$DEVICE" logcat -c || true
adb -s "$DEVICE" logcat -v time >"$RUN_DIR/logcat.txt" &
LOGCAT_PID=$!
sleep 30
kill "$LOGCAT_PID" >/dev/null 2>&1 || true

log "DONE"
log "Artifacts: $RUN_DIR"
