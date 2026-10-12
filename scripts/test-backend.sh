#!/usr/bin/env bash
# Runs the Muse test server on this Mac and shares it with testers over a free
# Cloudflare quick tunnel: Firebase emulators -> gateway -> tunnel -> phones.
# It is online only while this script runs and the Mac is awake and connected.
# See docs/test-backend.md.
#
# Usage: ./scripts/test-backend.sh [--demo-profiles] [--fresh]
#   --demo-profiles  add the sample members from the seed script (password Password123!)
#   --fresh          delete all test data first: accounts, profiles, chats and photos
set -euo pipefail
# Own process groups for background jobs, so Ctrl+C reaches only this script and
# the emulators get a single, clean shutdown signal (which saves their data).
set -m

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.test-backend"
DATA_DIR="$STATE_DIR/data"
LOG_DIR="$STATE_DIR/logs"
APK_FILE="${MUSE_TEST_APK:-$ROOT_DIR/dist/Muse-Test.apk}"
GATEWAY_PORT="${GATEWAY_PORT:-8787}"
PROJECT="demo-muse"
EXPORT_EVERY_SECONDS=300

DEMO_PROFILES=false
FRESH=false
for arg in "$@"; do
  case "$arg" in
    --demo-profiles) DEMO_PROFILES=true ;;
    --fresh) FRESH=true ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)"; exit 1 ;;
  esac
done

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing $1. $2"; exit 1; }
}
need node "Install Node.js 20 or newer."
need firebase "Run: npm install -g firebase-tools"
need java "Install a JDK, for example: brew install openjdk@17"
need cloudflared "Run: brew install cloudflared"

for port in 9099 8080 5001 9199 9150 4000 4400 4500 "$GATEWAY_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. Stop other Firebase emulators or servers first."
    exit 1
  fi
done

mkdir -p "$STATE_DIR" "$LOG_DIR"
if $FRESH; then
  echo "Deleting all test data..."
  rm -rf "$DATA_DIR" "$STATE_DIR/gateway-tokens.json" "$STATE_DIR"/firebase-export-*
fi

# A crash mid-export can leave the newest export in a temporary folder.
if [[ ! -f "$DATA_DIR/firebase-export-metadata.json" ]]; then
  latest="$(ls -dt "$STATE_DIR"/firebase-export-*/ 2>/dev/null | head -1 || true)"
  if [[ -n "$latest" && -f "$latest/firebase-export-metadata.json" ]]; then
    rm -rf "$DATA_DIR"
    mv "$latest" "$DATA_DIR"
    echo "Recovered test data from an interrupted save."
  fi
fi

echo "Building Cloud Functions..."
if ! npm --prefix "$ROOT_DIR/firebase/functions" run build >"$LOG_DIR/functions-build.log" 2>&1; then
  echo "The functions build failed. See $LOG_DIR/functions-build.log"
  exit 1
fi

EMULATORS_PID=""
GATEWAY_PID=""
TUNNEL_PID=""
EXPORT_PID=""
CAFFEINATE_PID=""

cleanup() {
  trap - EXIT INT TERM HUP
  echo
  echo "Stopping the test server (saving data)..."
  for pid in "$TUNNEL_PID" "$GATEWAY_PID" "$EXPORT_PID" "$CAFFEINATE_PID"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done
  if [[ -n "$EMULATORS_PID" ]] && kill -0 "$EMULATORS_PID" 2>/dev/null; then
    kill -INT "$EMULATORS_PID" 2>/dev/null || true
    for _ in $(seq 1 90); do
      kill -0 "$EMULATORS_PID" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$EMULATORS_PID" 2>/dev/null; then
      echo "The emulators didn't stop in time; data since the last automatic save may be lost."
      kill "$EMULATORS_PID" 2>/dev/null || true
    fi
  fi
  echo "Stopped."
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

# ------------------------------------------------------------------ optional keys
# Real push notifications: a service-account key for your Firebase project lets
# the emulators send through the real FCM (docs/test-backend.md).
if [[ -f "$STATE_DIR/push-service-account.json" ]]; then
  export MUSE_PUSH_CREDENTIALS="$STATE_DIR/push-service-account.json"
  echo "Push notifications: on (real FCM)."
fi
# Claude for the AI features; without it they use the free built-in writer.
if [[ -z "${ANTHROPIC_API_KEY:-}" && -f "$STATE_DIR/anthropic-api-key" ]]; then
  ANTHROPIC_API_KEY="$(tr -d '[:space:]' <"$STATE_DIR/anthropic-api-key")"
  export ANTHROPIC_API_KEY
fi
[[ -n "${ANTHROPIC_API_KEY:-}" ]] && echo "AI features: Claude."

# ------------------------------------------------------------------ emulators
# A private temp folder. The Storage emulator keeps uploaded photos in
# $TMPDIR/firebase/storage/blobs, and any other Storage emulator started on this
# Mac with the shared folder wipes it. The hub's locator file lives there too.
# Kept short: the Functions emulator puts a Unix socket in it (macOS caps socket
# paths at ~104 characters). Photos are restored from the saved data on start.
export TMPDIR="/tmp/muse-test-server-$(id -u)/"
mkdir -p "$TMPDIR" && chmod 700 "$TMPDIR"

EMULATOR_STARTS=0
start_emulators() {
  EMULATOR_STARTS=$((EMULATOR_STARTS + 1))
  local import_args=()
  if [[ -f "$DATA_DIR/firebase-export-metadata.json" ]]; then
    import_args=(--import "$DATA_DIR")
  fi
  : >"$LOG_DIR/emulators.log"
  # Run from the state folder: exports are staged in the working directory.
  (
    cd "$STATE_DIR"
    exec firebase --config "$ROOT_DIR/firebase.test-backend.json" --non-interactive \
      emulators:start --project "$PROJECT" --only auth,firestore,functions,storage \
      ${import_args[@]+"${import_args[@]}"} --export-on-exit "$DATA_DIR"
  ) >>"$LOG_DIR/emulators.log" 2>&1 &
  EMULATORS_PID=$!
  disown "$EMULATORS_PID" # watched with kill -0; no job-status noise on exit

  for _ in $(seq 1 180); do
    grep -q "All emulators ready" "$LOG_DIR/emulators.log" 2>/dev/null && return 0
    if ! kill -0 "$EMULATORS_PID" 2>/dev/null; then
      echo "The emulators failed to start. See $LOG_DIR/emulators.log"
      tail -20 "$LOG_DIR/emulators.log"
      return 1
    fi
    sleep 1
  done
  echo "The emulators took too long to start. See $LOG_DIR/emulators.log"
  return 1
}

echo "Starting the Firebase emulators..."
if ! start_emulators; then EMULATORS_PID=""; exit 1; fi

if $DEMO_PROFILES; then
  echo "Adding demo profiles..."
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT="$PROJECT" \
    node "$ROOT_DIR/firebase/functions/scripts/seed.js"
fi

# Save data regularly too, in case the Mac loses power.
(
  cd "$STATE_DIR"
  while sleep "$EXPORT_EVERY_SECONDS"; do
    firebase --config "$ROOT_DIR/firebase.test-backend.json" --non-interactive \
      emulators:export "$DATA_DIR" --project "$PROJECT" --force >>"$LOG_DIR/export.log" 2>&1 || true
  done
) &
EXPORT_PID=$!
disown "$EXPORT_PID"

# ------------------------------------------------------------------ gateway
start_gateway() {
  GATEWAY_PORT="$GATEWAY_PORT" GATEWAY_APK="$APK_FILE" MUSE_TEST_STATE_DIR="$STATE_DIR" \
    node "$ROOT_DIR/tools/test-backend/gateway.js" >>"$LOG_DIR/gateway.log" 2>&1 &
  GATEWAY_PID=$!
  disown "$GATEWAY_PID"
  for _ in $(seq 1 20); do
    curl -fsS "http://127.0.0.1:$GATEWAY_PORT/healthz" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  echo "The gateway failed to start. See $LOG_DIR/gateway.log"
  exit 1
}
start_gateway

# ------------------------------------------------------------------ tunnel
URL=""
start_tunnel() {
  URL=""
  : >"$LOG_DIR/tunnel.log"
  cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$GATEWAY_PORT" >>"$LOG_DIR/tunnel.log" 2>&1 &
  TUNNEL_PID=$!
  disown "$TUNNEL_PID"
  for _ in $(seq 1 60); do
    URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | head -1 || true)"
    [[ -n "$URL" ]] && break
    kill -0 "$TUNNEL_PID" 2>/dev/null || break
    sleep 1
  done
  if [[ -z "$URL" ]]; then
    echo "Couldn't open the Cloudflare tunnel. See $LOG_DIR/tunnel.log"
    return 1
  fi
  # New tunnel addresses take a few seconds to reach DNS.
  for _ in $(seq 1 45); do
    curl -fsS --max-time 5 "$URL/healthz" >/dev/null 2>&1 && break
    sleep 2
  done
  echo "$URL" >"$STATE_DIR/url.txt"
}

print_invite() {
  echo
  echo "=================================================================="
  echo " Muse test server is live"
  echo
  echo "   Invite link:  $URL"
  echo
  echo " Share the link with your group. It has the app download (when"
  echo " dist/Muse-Test.apk exists) and a button that connects the app."
  echo "=================================================================="
  if command -v qrencode >/dev/null 2>&1; then
    qrencode -t ANSIUTF8 "$URL"
  fi
  [[ -f "$APK_FILE" ]] || echo " No test app to share yet: run ./scripts/android/build-test-apk.sh"
  echo " Keep this window open and the Mac awake, plugged in and online."
  echo " Accounts and data: http://127.0.0.1:4000 (this Mac only)."
  echo " Press Ctrl+C to stop. Data is saved and comes back next time."
  echo
}

if ! start_tunnel; then exit 1; fi
print_invite

# Keep the Mac awake while the server runs (idle sleep; system sleep on power).
caffeinate -i -s -w $$ &
CAFFEINATE_PID=$!
disown "$CAFFEINATE_PID"

# ------------------------------------------------------------------ supervise
TUNNEL_FAILS=0
LAST_TUNNEL_CHECK=$SECONDS
while true; do
  sleep 5
  # A quick tunnel can stay "running" yet stop answering (e.g. after the Mac
  # sleeps): check the public link every minute, and replace it after 3 misses.
  if (( SECONDS - LAST_TUNNEL_CHECK >= 60 )); then
    LAST_TUNNEL_CHECK=$SECONDS
    if curl -fsS --max-time 10 "$URL/healthz" >/dev/null 2>&1; then
      TUNNEL_FAILS=0
    else
      TUNNEL_FAILS=$((TUNNEL_FAILS + 1))
      if (( TUNNEL_FAILS >= 3 )); then
        TUNNEL_FAILS=0
        kill "$TUNNEL_PID" 2>/dev/null || true
        sleep 1
      fi
    fi
  fi
  if ! kill -0 "$EMULATORS_PID" 2>/dev/null; then
    # Restart from the last automatic save; the gateway and tunnel (and so the
    # invite link) stay up.
    echo "The emulators stopped unexpectedly ($LOG_DIR/emulators.log). Restarting them from the last save..."
    cp "$LOG_DIR/emulators.log" "$LOG_DIR/emulators-crash-$(date +%Y%m%d-%H%M%S).log" 2>/dev/null || true
    if [[ "$EMULATOR_STARTS" -ge 5 ]] || ! start_emulators; then
      echo "The emulators keep failing. Stopping; see $LOG_DIR/emulators.log"
      EMULATORS_PID=""
      exit 1
    fi
    echo "The test server is back."
  fi
  if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
    echo "The gateway stopped; restarting it."
    start_gateway
  fi
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "The tunnel stopped or stopped answering; opening a new one. The invite link will change."
    until start_tunnel; do sleep 10; done
    print_invite
  fi
done
