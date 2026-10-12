#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
E2E_DIR="$ROOT_DIR/e2e"
APP_DIR="$ROOT_DIR/apps/muse-mobile"
FIREBASE_LOG="$ROOT_DIR/firebase/.emulator.log"
EXPO_LOG="$ROOT_DIR/apps/muse-mobile/.expo-dev-server.log"
QA_WORKSPACE=""

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

ensure_expo_server() {
  # Do not reuse/kill another server or read a developer's release environment.
  (cd "$APP_DIR" && EXPO_NO_DOTENV=1 EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true \
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 EXPO_PUBLIC_FUNCTIONS_REGION=us-central1 \
    EXPO_PUBLIC_E2E=true EXPO_PUBLIC_TEST_SERVER=false EXPO_PUBLIC_CALL_DOMAIN= \
    EXPO_PUBLIC_REVENUECAT_ANDROID_KEY= EXPO_PUBLIC_REVENUECAT_IOS_KEY= \
    exec ./node_modules/.bin/expo start --localhost --clear --port 8081 > "$EXPO_LOG" 2>&1) &
  EXPO_PID=$!
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

PLATFORM=${1:-android}
if [[ "$PLATFORM" != "android" && "$PLATFORM" != "ios" ]]; then echo "Use android or ios."; exit 1; fi
# Refuse occupied ports before seeding, so another test group's data stays intact.
for PORT in 8081 9099 8080 9199 5001 4400 4500 9150; do
  if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $PORT is occupied. Stop that server yourself before starting isolated UI QA."
    exit 1
  fi
done

EMULATOR_PID=""
EXPO_PID=""
cleanup() {
  for pid in "$EXPO_PID" "$EMULATOR_PID"; do
    [ -n "$pid" ] && kill "$pid" >/dev/null 2>&1 || true
  done
  # The emulators shut down cleanly on SIGTERM; wait so their ports are free.
  for _ in $(seq 1 30); do
    [ -n "$EMULATOR_PID" ] && kill -0 "$EMULATOR_PID" 2>/dev/null || break
    sleep 1
  done
  [[ -z "$QA_WORKSPACE" ]] || rm -rf "$QA_WORKSPACE"
}
trap cleanup EXIT

npm --prefix "$ROOT_DIR/firebase/functions" run build >/dev/null
QA_WORKSPACE="$(mktemp -d /tmp/muse-uiqa.XXXXXX)"
node "$ROOT_DIR/scripts/prepare-qa-emulators.cjs" "$QA_WORKSPACE" --default-ports
(cd "$QA_WORKSPACE" && TMPDIR="$QA_WORKSPACE/" FUNCTIONS_REGION=us-central1 exec firebase --config firebase.json \
  emulators:start --project demo-muse --only auth,firestore,storage,functions > "$FIREBASE_LOG" 2>&1) &
EMULATOR_PID=$!
if ! wait_for_port 9099 || ! wait_for_port 8080 || ! wait_for_port 9199 || ! wait_for_port 5001; then
  echo "Firebase emulators failed to start. See $FIREBASE_LOG"
  exit 1
fi
ensure_expo_server
MAESTRO_DEVICE_ARG=()

if [ "$PLATFORM" = "ios" ]; then
  if ! command -v xcrun >/dev/null 2>&1; then
    echo "xcrun not available. Install Xcode and run sudo xcode-select -s /Applications/Xcode.app"
    exit 1
  fi
  if ! xcrun simctl list devices >/dev/null 2>&1; then
    echo "simctl not available. Install Xcode and run sudo xcode-select -s /Applications/Xcode.app"
    exit 1
  fi
  DEVICE_ID="${MUSE_E2E_DEVICE:-$(xcrun simctl list devices available -j | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const d=Object.values(JSON.parse(s).devices).flat().filter(d=>d.name.startsWith("iPhone"));console.log((d.find(d=>d.state==="Booted")||d[0])?.udid||"")})')}"
  [[ -n "$DEVICE_ID" ]] || { echo "No iPhone simulator available."; exit 1; }
  xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
  xcrun simctl bootstatus "$DEVICE_ID" -b
  (cd "$APP_DIR" && EXPO_NO_DOTENV=1 npx expo prebuild --platform ios --no-install)
  (cd "$APP_DIR/ios" && pod install)
  IOS_BUILD="$QA_WORKSPACE/ios-build"
  xcodebuild -workspace "$APP_DIR/ios/Muse.xcworkspace" -scheme Muse -configuration Debug \
    -sdk iphonesimulator -destination "platform=iOS Simulator,id=$DEVICE_ID" -derivedDataPath "$IOS_BUILD" build
  xcrun simctl install "$DEVICE_ID" "$IOS_BUILD/Build/Products/Debug-iphonesimulator/Muse.app"
  MAESTRO_DEVICE_ARG=(--device "$DEVICE_ID")
elif [ "$PLATFORM" = "android" ]; then
  source "$ROOT_DIR/scripts/android/java-env.sh"
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
      if [ "${MUSE_E2E_SKIP_BUILD:-}" != "true" ]; then
        (cd "$APP_DIR/android" && ./gradlew assembleDebug)
      fi
      if [ -f "$DEBUG_APK" ] && [ -n "${DEVICE_ID:-}" ]; then
        if [[ "$DEVICE_ID" == emulator-* ]]; then
          adb -s "$DEVICE_ID" uninstall com.muse.app >/dev/null 2>&1 || true
        fi
        adb -s "$DEVICE_ID" install -r "$DEBUG_APK" >/dev/null
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
    "discovery.yaml"
    "chat.yaml"
    "vibe-first.yaml"
    "reports.yaml"
    "verification-required.yaml"
  )
fi

for FLOW in "${FLOWS[@]}"; do
  # Each flow gets fresh matches/likes/blocks; preceding flows cannot empty its deck.
  GCLOUD_PROJECT=demo-muse FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
    node "$ROOT_DIR/firebase/functions/scripts/seed.js" >/dev/null
  REQUIRE_VERIFICATION=false
  [[ "$FLOW" != "verification-required.yaml" ]] || REQUIRE_VERIFICATION=true
  GCLOUD_PROJECT=demo-muse FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
    node "$ROOT_DIR/firebase/functions/scripts/qa-trust-policy.js" "$REQUIRE_VERIFICATION"
  "$MAESTRO_BIN" "${MAESTRO_DEVICE_ARG[@]}" test "$E2E_DIR/$FLOW"
done
