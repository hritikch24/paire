#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_ROOT="$ROOT_DIR/artifacts"
RUN_DIR="$ARTIFACTS_ROOT/$(date +%Y-%m-%d_%H-%M-%S)-smoke"
MOBILE_DIR="$ROOT_DIR/apps/muse-mobile"
ANDROID_DIR="$MOBILE_DIR/android"
APP_ID="com.muse.app"
MAIN_ACTIVITY="com.muse.app/.MainActivity"

mkdir -p "$RUN_DIR"

log() {
  # Write to stderr so command substitutions can safely capture stdout.
  printf "[%s] %s\n" "$(date +%H:%M:%S)" "$*" | tee -a "$RUN_DIR/smoke.log" >&2
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

  local emulator_device
  emulator_device="$(adb devices | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ {print $1; exit}')"
  if [[ -n "$emulator_device" ]]; then
    echo "$emulator_device"
    return 0
  fi

  adb devices | awk 'NR>1 && $2=="device" {print $1; exit}'
}

start_emulator_if_needed() {
  local device
  device="$(pick_device || true)"
  if [[ -n "$device" ]]; then
    echo "$device"
    return 0
  fi

if ! command -v emulator >/dev/null 2>&1; then
    log "ERROR: emulator command not found. Install Android SDK emulator or set ANDROID_HOME."
    exit 1
  fi

  local avd="${MUSE_AVD:-}"
  if [[ -z "$avd" ]]; then
    avd="$(emulator -list-avds | head -n 1)"
  fi
  if [[ -z "$avd" ]]; then
    log "ERROR: No Android AVD found. Create one (once) via Android Studio, then rerun."
    exit 1
  fi

  log "Starting emulator: $avd"
  nohup emulator -avd "$avd" -netdelay none -netspeed full >"$RUN_DIR/emulator.log" 2>&1 &
  adb wait-for-device
  sleep 2
  echo "$(pick_device)"
}

set_default_env

if ! command -v adb >/dev/null 2>&1; then
  log "ERROR: adb not found. Install Android SDK platform-tools or set ANDROID_HOME."
  exit 1
fi

DEVICE="$(start_emulator_if_needed)"
log "Using device: $DEVICE"

USE_RELEASE="${MUSE_SMOKE_USE_RELEASE:-false}"
DEBUG_APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
RELEASE_APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"

APK_PATH="$DEBUG_APK"
BUILD_TASK="assembleDebug"
BUILD_LOG="$RUN_DIR/gradle-assembleDebug.log"

if [[ "$USE_RELEASE" == "true" ]]; then
  APK_PATH="$RELEASE_APK"
  BUILD_TASK="assembleRelease"
  BUILD_LOG="$RUN_DIR/gradle-assembleRelease.log"
fi

if [[ ! -f "$APK_PATH" ]]; then
  log "APK not found; building $BUILD_TASK"
  if [[ -z "${ANDROID_HOME:-}" ]]; then
    log "ERROR: ANDROID_HOME is not set. Install Android SDK or set ANDROID_HOME."
    exit 1
  fi
  LOCAL_PROPS="$ANDROID_DIR/local.properties"
  if [[ ! -f "$LOCAL_PROPS" ]]; then
    log "Writing $LOCAL_PROPS (sdk.dir)"
    printf "sdk.dir=%s\n" "$ANDROID_HOME" >"$LOCAL_PROPS"
  fi
  (cd "$ANDROID_DIR" && ./gradlew "$BUILD_TASK") >"$BUILD_LOG" 2>&1
fi

log "Installing APK: $APK_PATH"
adb -s "$DEVICE" install -r "$APK_PATH" >"$RUN_DIR/adb-install.log" 2>&1

if [[ "${MUSE_CLEAR_STATE:-}" == "true" ]]; then
  log "Clearing app state (MUSE_CLEAR_STATE=true)"
  adb -s "$DEVICE" shell pm clear "$APP_ID" >"$RUN_DIR/pm-clear.log" 2>&1 || true
fi

log "Launching app"
adb -s "$DEVICE" shell am start -n "$MAIN_ACTIVITY" >"$RUN_DIR/am-start.log" 2>&1 || true

log "Capturing logcat for 120 seconds"
adb -s "$DEVICE" logcat -c || true
adb -s "$DEVICE" logcat -v time >"$RUN_DIR/logcat.txt" &
LOGCAT_PID=$!
sleep 120
kill "$LOGCAT_PID" >/dev/null 2>&1 || true

log "DONE"
log "Artifacts: $RUN_DIR"
