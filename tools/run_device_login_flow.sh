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

echo "[login-flow] Using device: $DEVICE"

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

PY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/adb_tap_text.py"

tap_or_coordinate() {
  local label="$1"
  local x="$2"
  local y="$3"
  if [[ -n "$label" ]]; then
    "$PY" --text "$label" --wait 400 --contains >/dev/null 2>&1 && sleep 0.4 && return 0
  fi
  adb -s "$DEVICE" shell input tap "$x" "$y"
  sleep 0.8
}

dump_ui() {
  adb -s "$DEVICE" shell uiautomator dump /sdcard/window_dump.xml >/dev/null 2>&1 || return 1
  adb -s "$DEVICE" shell cat /sdcard/window_dump.xml 2>/dev/null || return 1
}

wait_for_text() {
  local needle=$1
  for _ in $(seq 1 4); do
    if dump_ui | rg -q "$needle"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

bring_app_front() {
  adb -s "$DEVICE" shell am start -n "$APP_ID/.MainActivity" >/dev/null 2>&1 || true
  adb -s "$DEVICE" shell cmd statusbar collapse >/dev/null 2>&1 || true
  sleep 1
}

dismiss_offline_demo() {
  if dump_ui | rg -q "Offline demo mode"; then
    tap_or_coordinate "OK" 860 1220
    sleep 0.6
  fi
}

step() {
  echo "[login-flow] $1"
}

step "Open Log in"
wait_for_text "Muse" || true
tap_or_coordinate "Log in" 540 905
wait_for_text "Welcome back" || bring_app_front

# Fill real login (seeded emulator user)
step "Enter email + password"
adb -s "$DEVICE" shell input tap 540 560
adb -s "$DEVICE" shell input text "muse%2Balexa%40example.com"
sleep 0.6
adb -s "$DEVICE" shell input tap 540 700
adb -s "$DEVICE" shell input text "Password123%21"
sleep 0.6

step "Continue"
tap_or_coordinate "Continue" 540 860
sleep 3
dismiss_offline_demo

if [[ "${MUSE_LOGIN_ONLY:-0}" != "1" ]]; then
  # Fallback: demo account if login fails
  step "Fallback demo login"
  adb -s "$DEVICE" shell input tap 540 1410
  sleep 2
  adb -s "$DEVICE" shell input tap 890 1175 || true
  sleep 1
fi

wait_for_text "Discover|Profile strength" || bring_app_front

adb -s "$DEVICE" exec-out screencap -p > /tmp/muse_device_login_flow.png
adb -s "$DEVICE" logcat -d | rg -i "FATAL EXCEPTION|AndroidRuntime|TypeError|Invariant Violation" || true

echo "[login-flow] Done"
