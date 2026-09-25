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

STAMP=$(date +"%Y%m%d_%H%M%S")
OUT_DIR="/tmp/muse_qa_${STAMP}"
mkdir -p "$OUT_DIR"

echo "[qa] Using device: $DEVICE"
echo "[qa] Screenshots: $OUT_DIR"

if ! lsof -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[qa] Metro not running. Starting..."
  nohup npm --prefix /Users/hritik/Projects/muse/apps/muse-mobile start -- --dev-client > /tmp/muse_metro.log 2>&1 &
  sleep 4
fi
for i in $(seq 1 10); do
  if curl -s http://127.0.0.1:8081/status | rg -q "packager-status:running"; then
    break
  fi
  sleep 1
done

adb -s "$DEVICE" reverse tcp:8081 tcp:8081
adb -s "$DEVICE" reverse tcp:9099 tcp:9099 || true
adb -s "$DEVICE" reverse tcp:8080 tcp:8080 || true
adb -s "$DEVICE" reverse tcp:5001 tcp:5001 || true
adb -s "$DEVICE" reverse tcp:9199 tcp:9199 || true
adb -s "$DEVICE" logcat -c || true
adb -s "$DEVICE" shell pm clear "$APP_ID" >/dev/null 2>&1 || true
adb -s "$DEVICE" shell cmd statusbar collapse || true
adb -s "$DEVICE" shell input keyevent 82 || true
adb -s "$DEVICE" shell am force-stop "$APP_ID" || true
adb -s "$DEVICE" shell am start -n "$APP_ID/.MainActivity"

sleep 8

tap() {
  local x=$1
  local y=$2
  adb -s "$DEVICE" shell input tap "$x" "$y"
  sleep 0.8
}

PY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/adb_tap_text.py"

tap_text() {
  local label="$1"
  "$PY" --text "$label" --wait 600 --contains >/dev/null 2>&1 || return 1
  sleep 0.4
  return 0
}

type_text() {
  local txt=$1
  adb -s "$DEVICE" shell input text "$txt" || true
  sleep 0.5
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
    tap_text "OK" || tap 860 1220
    sleep 0.6
  fi
}

exit_call_if_needed() {
  if dump_ui | rg -q "Audio call|Join meeting|End"; then
    tap_text "End" || tap 930 170
    sleep 0.8
    tap_text "Leave" || true
    sleep 0.6
    adb -s "$DEVICE" shell input keyevent 4 || true
    sleep 0.6
    adb -s "$DEVICE" shell input keyevent 4 || true
    sleep 0.6
  fi
}

swipe_up() {
  adb -s "$DEVICE" shell input swipe 540 1900 540 600 300
  sleep 0.8
}

snap() {
  local name=$1
  adb -s "$DEVICE" exec-out screencap -p > "${OUT_DIR}/${name}.png"
}

allow_permission() {
  # Typical Android permission "Allow while using the app" button area
  tap 840 1370
  sleep 0.8
}

step() {
  echo "[qa] $1"
}

step "Welcome"
wait_for_text "Muse" || true
snap "01_welcome"

step "Create account"
tap_text "Create account" || tap 540 1020
sleep 1
wait_for_text "Create your account" || true
snap "02_signup"

step "Fill basics"
EMAIL="muse+qa${STAMP}@example.com"
tap_text "Email" || tap 540 650
type_text "$EMAIL"
tap_text "Password" || tap 540 780
type_text "Muse%23123%21"
tap_text "Confirm password" || tap 540 920
type_text "Muse%23123%21"
tap_text "Create account" || tap 540 1080
sleep 2
wait_for_text "Introduce yourself" || bring_app_front
tap 540 460
type_text "MuseTester"
tap 540 620
type_text "they/them"
tap 540 780
type_text "26"
tap 540 940
type_text "Delhi"
tap 540 1100
type_text "Testing%sMuse%send%sto%send"
swipe_up
snap "03_intro_basics"

step "Select vibes"
tap 250 740
tap 650 740
tap 250 860
sleep 0.5
snap "04_vibes_selected"

step "Select looking for"
tap 250 1120
tap 650 1120
sleep 0.5
snap "05_looking_for"

step "Toggle location"
tap 900 1320
sleep 0.5
allow_permission || true
snap "06_location_toggle"

step "Continue to photos"
tap_text "Continue" || tap 540 1520
sleep 1
snap "07_add_photos"

step "Skip photos"
tap_text "Add photo" || tap 540 520
tap_text "Continue" || tap 540 700
sleep 1
snap "08_muse_cards"

step "Pick muse cards"
tap 220 330
tap 660 330
tap 220 530
tap 540 1710
sleep 1
snap "09_cards_selected"

step "Rapid questions"
tap 240 340
tap 240 840
tap 240 1240
tap_text "Continue" || tap 540 1520
sleep 1
wait_for_text "Safety first" || true
snap "10_rapid_questions"

step "Safety first"
tap 170 360
tap_text "Enter Muse" || tap 540 520
sleep 1
if ! wait_for_text "Discover"; then
  snap "11_discover_missing"
fi
dismiss_offline_demo
snap "11_discover"

step "Discover: like + swipe"
tap 540 1880
adb -s "$DEVICE" shell input swipe 800 1500 200 1500 300 || true
sleep 1
snap "12_discover_after_like"

step "Matches tab"
tap 540 2290
sleep 1
wait_for_text "Matches" || true
snap "13_matches"

step "Open first match"
if dump_ui | rg -q "No matches yet"; then
  snap "14_no_matches"
  tap_text "Go to Discover" || tap 540 980
  sleep 1
  adb -s "$DEVICE" shell input swipe 800 1500 200 1500 300 || true
  sleep 1
  tap 540 2290
  sleep 1
fi
tap 200 520
sleep 1
wait_for_text "Safety check" || true
snap "14_chat"

step "Send message"
tap 200 2040
type_text "Hey%20there%20from%20Muse%20QA"
adb -s "$DEVICE" shell input keyevent 66 || true
sleep 1
snap "15_chat_message"

step "Audio call"
tap 300 420
sleep 1
tap 540 1600
allow_permission || true
allow_permission || true
sleep 1
snap "16_call"
exit_call_if_needed
adb -s "$DEVICE" shell input keyevent 4
sleep 1

step "Unmatch"
tap 540 520
tap 830 1406
sleep 1
snap "17_unmatch"

step "Report or block"
tap 740 500
sleep 1
snap "18_report_block"
adb -s "$DEVICE" shell input keyevent 4
sleep 1

step "Safety center"
tap 540 1600
sleep 1
wait_for_text "Safety center" || true
snap "19_safety_center"
adb -s "$DEVICE" shell input keyevent 4
sleep 1

step "Profile tab"
tap 900 2290
sleep 1
wait_for_text "Profile strength" || true
snap "20_profile"

step "Open settings"
tap_text "Settings" || tap 540 1750
sleep 1
if ! wait_for_text "Settings"; then
  snap "21_settings_missing"
fi
snap "21_settings"
tap 900 860
sleep 1
snap "22_settings_location"
adb -s "$DEVICE" shell input keyevent 4
sleep 1

step "Back to welcome and test guest"
adb -s "$DEVICE" shell am force-stop "$APP_ID" || true
adb -s "$DEVICE" shell am start -n "$APP_ID/.MainActivity"
sleep 6
tap_text "Explore as guest" || tap 540 1180
sleep 1
dismiss_offline_demo
snap "23_guest_discover"
tap 540 2290
sleep 1
snap "24_guest_matches"
tap 540 1250
sleep 1
snap "25_guest_demo_chat"

step "Back to welcome and test login"
adb -s "$DEVICE" shell am force-stop "$APP_ID" || true
adb -s "$DEVICE" shell am start -n "$APP_ID/.MainActivity"
sleep 6
tap_text "Log in" || tap 540 905
sleep 1
wait_for_text "Welcome back" || bring_app_front
tap 540 560
type_text "muse%2Balexa%40example.com"
tap 540 700
type_text "Password123%21"
tap_text "Continue" || tap 540 860
sleep 3
dismiss_offline_demo
snap "26_login_discover"

adb -s "$DEVICE" logcat -d | rg -i "FATAL EXCEPTION|AndroidRuntime|TypeError|Invariant Violation" || true

echo "[qa] Done. Screenshots in $OUT_DIR"
