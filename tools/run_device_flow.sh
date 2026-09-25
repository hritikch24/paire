#!/usr/bin/env bash
set -euo pipefail

DEVICE=${MUSE_DEVICE:-}
APP_ID="com.muse.app"

if [[ -z "$DEVICE" ]]; then
  DEVICE=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
fi

if [[ -z "$DEVICE" ]]; then
  echo "No adb device found" >&2
  exit 1
fi

echo "[flow] Using device: $DEVICE"

adb -s "$DEVICE" reverse tcp:8081 tcp:8081
adb -s "$DEVICE" reverse tcp:9099 tcp:9099 || true
adb -s "$DEVICE" reverse tcp:8080 tcp:8080 || true
adb -s "$DEVICE" reverse tcp:5001 tcp:5001 || true
adb -s "$DEVICE" reverse tcp:9199 tcp:9199 || true
adb -s "$DEVICE" logcat -c || true
adb -s "$DEVICE" shell cmd statusbar collapse || true
adb -s "$DEVICE" shell input keyevent 82 || true
adb -s "$DEVICE" shell am force-stop "$APP_ID" || true
adb -s "$DEVICE" shell am start -n "$APP_ID/.MainActivity"

sleep 2

step() {
  local label=$1
  echo "[flow] $label"
}

ensure_app() {
  local snapshot
  snapshot=$(adb -s "$DEVICE" shell cat /sdcard/window_dump.xml 2>/dev/null || true)
  if ! echo "$snapshot" | rg -q "com.muse.app"; then
    adb -s "$DEVICE" shell am start -n "$APP_ID/.MainActivity" >/dev/null
    sleep 2
  fi
}

# Fallback taps for 1080x2400 device
tap_fallback() {
  local x=$1
  local y=$2
  adb -s "$DEVICE" shell input tap "$x" "$y"
  sleep 0.8
}


# Welcome -> Explore as guest
step "Tap Explore as guest"
tap_fallback 540 1085

# Discover screen: attempt Like
step "Tap Like"
tap_fallback 540 1880
adb -s "$DEVICE" shell input swipe 800 1500 200 1500 300 || true

# Bottom nav -> Matches
step "Open Matches tab"
tap_fallback 540 2290

# Muse Now (Random connect)
step "Open Muse Now"
tap_fallback 540 640
sleep 1
step "Start random chat"
tap_fallback 540 1080
sleep 1
step "Back from random chat"
adb -s "$DEVICE" shell input keyevent 4
sleep 1
step "Start random audio call"
tap_fallback 300 1220
sleep 1
tap_fallback 540 1600
sleep 1
step "Back from random call"
adb -s "$DEVICE" shell input keyevent 4
sleep 1
step "Start random video call"
tap_fallback 780 1220
sleep 1
tap_fallback 540 1600
sleep 1
step "Back from random video call"
adb -s "$DEVICE" shell input keyevent 4
sleep 1

# Demo chat in guest mode
step "Open demo chat"
tap_fallback 540 1250

# Send message in demo chat
step "Focus message input"
tap_fallback 200 2040
adb -s "$DEVICE" shell input text "Hey%20there" || true
adb -s "$DEVICE" shell input keyevent 66 || true
sleep 1

# Trigger call
step "Open video call"
tap_fallback 840 420

# Accept call consent
step "Join call"
tap_fallback 540 1600

# Back to chat
step "Go back"
adb -s "$DEVICE" shell input keyevent 4
sleep 1

# Unmatch
step "Unmatch"
tap_fallback 540 520
tap_fallback 830 1406

# Report or block
step "Report or block"
tap_fallback 740 500

# Back to matches
step "Back"
adb -s "$DEVICE" shell input keyevent 4
sleep 1

# Safety center
step "Open Safety center"
tap_fallback 540 1600

# Back to profile
step "Back"
adb -s "$DEVICE" shell input keyevent 4
sleep 1

# Bottom nav -> Profile
step "Open Profile tab"
tap_fallback 900 2290

# Settings
step "Open Settings"
tap_fallback 540 1750

# Toggle Share location
step "Toggle Share location"
tap_fallback 900 860

# Back out
adb -s "$DEVICE" shell input keyevent 4
sleep 1

# Support email button
step "Email support"
tap_fallback 540 2060

# Final log check
adb -s "$DEVICE" logcat -d | rg -i "FATAL EXCEPTION|AndroidRuntime|TypeError|Invariant Violation" || true

echo "[flow] Done"
