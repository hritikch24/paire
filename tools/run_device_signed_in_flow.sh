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

echo "[signed-in-flow] Using device: $DEVICE"

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

tap() {
  local x=$1
  local y=$2
  adb -s "$DEVICE" shell input tap "$x" "$y"
  sleep 0.8
}

step() {
  echo "[signed-in-flow] $1"
}

step "Open Log in"
tap 540 905

step "Enter email + password"
tap 540 560
adb -s "$DEVICE" shell input text "muse%2Balexa%40example.com"
sleep 0.6
tap 540 700
adb -s "$DEVICE" shell input text "Password123%21"
sleep 0.6

step "Continue"
tap 540 860
sleep 3

step "Discover: Like"
tap 540 1880
adb -s "$DEVICE" shell input swipe 800 1500 200 1500 300 || true

step "Open Matches tab"
tap 540 2290
sleep 1

step "Open Muse Now"
tap 540 640
sleep 1

step "Start random chat"
tap 540 1080
sleep 1

step "Back from random chat"
adb -s "$DEVICE" shell input keyevent 4
sleep 1

step "Start random audio call"
tap 300 1220
sleep 1
tap 540 1600
sleep 1
adb -s "$DEVICE" shell input keyevent 4
sleep 1

step "Open first match"
tap 200 520
sleep 1

step "Send message"
tap 200 2040
adb -s "$DEVICE" shell input text "Hey%20Jules%2C%20want%20to%20grab%20coffee%3F"
adb -s "$DEVICE" shell input keyevent 66 || true
sleep 1

step "Start audio call"
tap 300 420
sleep 1
tap 540 1600
sleep 1

step "Back to chat"
adb -s "$DEVICE" shell input keyevent 4
sleep 1

step "Unmatch"
tap 540 520
tap 830 1406
sleep 1

adb -s "$DEVICE" logcat -d | rg -i "FATAL EXCEPTION|AndroidRuntime|TypeError|Invariant Violation" || true

echo "[signed-in-flow] Done"
