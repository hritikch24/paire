#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
E2E_DIR="$ROOT_DIR/e2e"
APP_DIR="$ROOT_DIR/apps/muse-mobile"
FIREBASE_LOG="$ROOT_DIR/firebase/.emulator.log"
EXPO_LOG="$ROOT_DIR/apps/muse-mobile/.expo-dev-server.log"
ENV_BACKUP=""

wait_for_port() {
  local port="$1"
  local retries=60
  while ! lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      return 1
    fi
    sleep 1
  done
}

prepare_env() {
  if [ -f "$APP_DIR/.env" ]; then
    ENV_BACKUP="$APP_DIR/.env.e2e.backup"
    cp "$APP_DIR/.env" "$ENV_BACKUP"
    if grep -q "^EXPO_PUBLIC_E2E=" "$APP_DIR/.env"; then
      sed "s/^EXPO_PUBLIC_E2E=.*/EXPO_PUBLIC_E2E=true/" "$ENV_BACKUP" > "$APP_DIR/.env"
    else
      cat "$ENV_BACKUP" > "$APP_DIR/.env"
      echo "EXPO_PUBLIC_E2E=true" >> "$APP_DIR/.env"
    fi
  fi
}

restore_env() {
  if [ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ]; then
    mv "$ENV_BACKUP" "$APP_DIR/.env"
  fi
}

ensure_expo_server() {
  local port=8081
  if lsof -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1; then
    local pid
    pid="$(lsof -tiTCP:${port} -sTCP:LISTEN | head -n1)"
    if [ -n "$pid" ]; then
      local cmd
      cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      if [[ "$cmd" == *"$APP_DIR"* ]]; then
        echo "Expo dev server already running for $APP_DIR."
        return 0
      fi
      echo "Port ${port} in use by non-Muse dev server. Restarting..."
      kill "$pid" >/dev/null 2>&1 || true
      sleep 2
    fi
  fi

  (cd "$APP_DIR" && nohup npx expo start --dev-client --clear --port 8081 > "$EXPO_LOG" 2>&1 & echo $! > "$EXPO_LOG.pid")
  EXPO_PID="$(cat "$EXPO_LOG.pid" 2>/dev/null || true)"
  if ! wait_for_port 8081; then
    echo "Expo dev server failed to start. See $EXPO_LOG"
    exit 1
  fi
}

MAESTRO_BIN=""
if [ -x "$ROOT_DIR/tools/maestro/bin/maestro" ]; then
  MAESTRO_BIN="$ROOT_DIR/tools/maestro/bin/maestro"
elif command -v maestro >/dev/null 2>&1; then
  MAESTRO_BIN="maestro"
else
  echo "Maestro not installed. Run ./scripts/bootstrap-macos.sh first."
  exit 1
fi

PLATFORM=${1:-ios}

EMULATOR_PID=""
EXPO_PID=""
cleanup() {
  if [ -n "$EXPO_PID" ]; then
    kill "$EXPO_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "$EMULATOR_PID" ]; then
    kill "$EMULATOR_PID" >/dev/null 2>&1 || true
  fi
  restore_env
}
trap cleanup EXIT

prepare_env
ensure_expo_server

if ! lsof -iTCP:9099 -sTCP:LISTEN >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && nohup firebase emulators:start --project demo-muse --only auth,firestore,storage,functions > "$FIREBASE_LOG" 2>&1 & echo $! > "$FIREBASE_LOG.pid")
  EMULATOR_PID="$(cat "$FIREBASE_LOG.pid" 2>/dev/null || true)"
  if ! wait_for_port 9099 || ! wait_for_port 8080 || ! wait_for_port 9199 || ! wait_for_port 5001; then
    echo "Firebase emulators failed to start. See $FIREBASE_LOG"
    exit 1
  fi
fi

GCLOUD_PROJECT=demo-muse FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node "$ROOT_DIR/firebase/functions/scripts/seed.js" >/dev/null

if [ "$PLATFORM" = "ios" ]; then
  if ! command -v xcrun >/dev/null 2>&1; then
    echo "xcrun not available. Install Xcode and run sudo xcode-select -s /Applications/Xcode.app"
    exit 1
  fi
  if ! xcrun simctl list devices >/dev/null 2>&1; then
    echo "simctl not available. Install Xcode and run sudo xcode-select -s /Applications/Xcode.app"
    exit 1
  fi
  if ! xcrun simctl list devices | grep -q "(Booted)"; then
    DEVICE_NAME="$(xcrun simctl list devices available | awk -F ' \\(' '/iPhone/ {print $1; exit}' | sed -E 's/^ *//')"
    if [ -n "$DEVICE_NAME" ]; then
      xcrun simctl boot "$DEVICE_NAME" || true
    else
      echo "No available iPhone simulators found. Create one in Xcode."
      exit 1
    fi
  fi
elif [ "$PLATFORM" = "android" ]; then
  if ! command -v adb >/dev/null 2>&1; then
    echo "adb not available. Check Android SDK install."
    exit 1
  fi
  if ! adb devices | grep -q "device$"; then
    if command -v emulator >/dev/null 2>&1; then
      AVD=$(emulator -list-avds | awk 'tolower($0) ~ /muse/ {print; exit}')
      if [ -z "$AVD" ]; then
        AVD=$(emulator -list-avds | head -n1)
      fi
      if [ -n "$AVD" ]; then
        emulator -avd "$AVD" -netdelay none -netspeed full >/dev/null 2>&1 &
        adb wait-for-device
      else
        echo "No Android AVD found. Create one in Android Studio."
        exit 1
      fi
    fi
  fi

  # Prefer emulator for E2E unless a specific device is requested.
  if [ -n "${MUSE_E2E_DEVICE:-}" ]; then
    DEVICE_ID="$MUSE_E2E_DEVICE"
  else
    DEVICE_ID="$(adb devices | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ {print $1; exit}')"
    if [ -z "$DEVICE_ID" ]; then
      DEVICE_ID="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
    fi
  fi

  if [ -d "$APP_DIR/android" ]; then
    ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
    if [ -d "$ANDROID_HOME" ]; then
      echo "sdk.dir=$ANDROID_HOME" > "$APP_DIR/android/local.properties"
      DEBUG_APK="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
      if [ ! -f "$DEBUG_APK" ] || [ "${MUSE_E2E_BUILD:-}" = "true" ]; then
        (cd "$APP_DIR/android" && ./gradlew assembleDebug)
      fi
      if [ -f "$DEBUG_APK" ] && [ -n "${DEVICE_ID:-}" ]; then
        if [[ "$DEVICE_ID" == emulator-* ]]; then
          adb -s "$DEVICE_ID" uninstall com.muse.app >/dev/null 2>&1 || true
        fi
        adb -s "$DEVICE_ID" install -r "$DEBUG_APK" >/dev/null 2>&1 || true
      fi
    fi
  fi
  if [ -n "${DEVICE_ID:-}" ]; then
    export ANDROID_SERIAL="$DEVICE_ID"
    adb -s "$DEVICE_ID" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
    adb -s "$DEVICE_ID" reverse tcp:8080 tcp:8080 >/dev/null 2>&1 || true
    adb -s "$DEVICE_ID" reverse tcp:9099 tcp:9099 >/dev/null 2>&1 || true
    adb -s "$DEVICE_ID" reverse tcp:9199 tcp:9199 >/dev/null 2>&1 || true
    adb -s "$DEVICE_ID" reverse tcp:5001 tcp:5001 >/dev/null 2>&1 || true
    MAESTRO_DEVICE_ARG=(--device "$DEVICE_ID")
  else
    MAESTRO_DEVICE_ARG=()
  fi
fi

FLOW_LIST=${MUSE_E2E_FLOW:-}
if [ -n "$FLOW_LIST" ]; then
  IFS=',' read -r -a FLOWS <<< "$FLOW_LIST"
else
  FLOWS=(
    "onboarding.yaml"
    "onboarding-full.yaml"
    "discovery.yaml"
    "match.yaml"
    "chat.yaml"
    "chat-two-users.yaml"
  )
fi

for FLOW in "${FLOWS[@]}"; do
  "$MAESTRO_BIN" "${MAESTRO_DEVICE_ARG[@]}" test "$E2E_DIR/$FLOW"
done
