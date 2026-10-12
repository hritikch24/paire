#!/usr/bin/env bash
# Checks everything that must be true before building a Google Play release.
# Usage: ./scripts/release-preflight.sh [--with-tests]
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/muse-mobile"
FUNCTIONS_DIR="$ROOT_DIR/firebase/functions"
FAILS=0
WARNS=0

ok() { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; WARNS=$((WARNS + 1)); }
fail() { printf "  \033[31m✗\033[0m %s\n" "$*"; FAILS=$((FAILS + 1)); }

env_value() {
  # Reads KEY from the environment, then .env.production (the file release bundles use).
  local key="$1"
  if [[ -n "${!key:-}" ]]; then
    printf "%s" "${!key}"
    return
  fi
  if [[ -f "$APP_DIR/.env.production" ]]; then
    grep -E "^${key}=" "$APP_DIR/.env.production" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
  fi
}

echo "Legal pages (firebase/hosting)"
PLACEHOLDERS=$(grep -oE "\[(DEVELOPER NAME|SUPPORT EMAIL|POSTAL ADDRESS|GRIEVANCE OFFICER NAME|GRIEVANCE EMAIL|EFFECTIVE DATE|YEAR|CITY|RETENTION PERIOD[^]]*|LIABILITY CAP[^]]*)\]" "$ROOT_DIR"/firebase/hosting/*.html | sort -u)
if [[ -n "$PLACEHOLDERS" ]]; then
  fail "Replace these placeholders, then run: firebase deploy --only hosting"
  echo "$PLACEHOLDERS" | sed 's/^/      /'
else
  ok "No placeholders left in the privacy policy, terms and deletion pages"
fi

echo "App configuration (apps/muse-mobile/.env.production)"
SUPPORT_EMAIL="$(env_value EXPO_PUBLIC_SUPPORT_EMAIL)"
if [[ "$SUPPORT_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  ok "Support email: $SUPPORT_EMAIL"
else
  fail "Set EXPO_PUBLIC_SUPPORT_EMAIL to an inbox you monitor (shown in the app and required by Play)"
fi
if [[ "$(env_value EXPO_PUBLIC_USE_FIREBASE_EMULATOR)" == "true" || "$(env_value EXPO_PUBLIC_E2E)" == "true" ]]; then
  fail "Release env must not enable EXPO_PUBLIC_USE_FIREBASE_EMULATOR or EXPO_PUBLIC_E2E"
elif grep -qsE "^EXPO_PUBLIC_TEST_SERVER=" "$APP_DIR"/.env "$APP_DIR"/.env.production "$APP_DIR"/.env.local "$APP_DIR"/.env.production.local; then
  fail "Remove EXPO_PUBLIC_TEST_SERVER from apps/muse-mobile/.env files: it makes the \"Muse Test\" build, not the Play app"
else
  ok "Release env targets production Firebase"
fi
APP_REGION="$(env_value EXPO_PUBLIC_FUNCTIONS_REGION)"; APP_REGION="${APP_REGION:-us-central1}"
FN_REGION="$(grep -E '^FUNCTIONS_REGION=' "$FUNCTIONS_DIR/.env" 2>/dev/null | cut -d= -f2-)"; FN_REGION="${FN_REGION:-us-central1}"
if [[ "$APP_REGION" == "$FN_REGION" ]]; then
  ok "Cloud Functions region matches: $APP_REGION"
else
  fail "App calls functions in $APP_REGION but they deploy to $FN_REGION (EXPO_PUBLIC_FUNCTIONS_REGION vs firebase/functions/.env FUNCTIONS_REGION)"
fi

echo "Trust and paid access"
backend_value() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then printf "%s" "${!key}"; return; fi
  if [[ -f "$FUNCTIONS_DIR/.env" ]]; then
    rg "^${key}=" "$FUNCTIONS_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '\"' | tr -d "'"
  fi
}
if [[ "$(backend_value MUSE_VERIFICATION_ENABLED)" != "true" ]]; then
  fail "Public dating launch needs live photo verification configured and acceptance-tested (docs/production-integrations.md)"
elif [[ -z "$(backend_value DIDIT_WORKFLOW_ID)" || -z "$(backend_value DIDIT_APPLICATION_ID)" ]]; then
  fail "Set DIDIT_WORKFLOW_ID and DIDIT_APPLICATION_ID in firebase/functions/.env"
else
  ok "Verification identifiers configured; confirm deployed trust policy and live callback/review/erasure QA"
fi
if [[ "$(backend_value MUSE_BILLING_ENABLED)" == "true" && -z "$(env_value EXPO_PUBLIC_REVENUECAT_ANDROID_KEY)" ]]; then
  fail "Premium is enabled on the server but the Android RevenueCat SDK key is missing"
fi

echo "Android"
if [[ -f "$APP_DIR/${GOOGLE_SERVICES_JSON:-google-services.json}" ]]; then
  ok "google-services.json present (push notifications enabled)"
else
  warn "google-services.json missing: the build works, but push notifications stay off"
fi
if [[ -f "$APP_DIR/keystore.properties" || -n "${MUSE_UPLOAD_STORE_FILE:-}" || -n "${EAS_BUILD:-}" ]]; then
  ok "Upload key configured"
else
  fail "No upload key. Run ./scripts/android/create-upload-keystore.sh (or build with EAS)"
fi
VERSION_INFO=$(cd "$APP_DIR" && node -e "const c=require('./app.config.js')({config:{}}); console.log('version ' + c.version + ', versionCode ' + c.android.versionCode)")
ok "Will build $VERSION_INFO (versionCode must be higher than any previous upload)"

if [[ "${1:-}" == "--with-tests" ]]; then
  echo "Automated checks"
  (cd "$APP_DIR" && npm run --silent typecheck && npm run --silent lint && npm run --silent test:unit -- --silent) >/dev/null 2>&1 \
    && ok "App: typecheck, lint, unit tests" || fail "App checks failed (cd apps/muse-mobile && npm run fastcheck)"
  (cd "$FUNCTIONS_DIR" && npm run --silent typecheck && npm run --silent lint && npm test -- --silent) >/dev/null 2>&1 \
    && ok "Functions: typecheck, lint, unit tests" || fail "Functions checks failed (cd firebase/functions && npm test)"
fi

echo
if [[ $FAILS -gt 0 ]]; then
  printf "\033[31mPreflight failed: %d problem(s), %d warning(s).\033[0m\n" "$FAILS" "$WARNS"
  exit 1
fi
printf "\033[32mPreflight passed\033[0m with %d warning(s).\n" "$WARNS"
