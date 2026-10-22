#!/usr/bin/env bash
# Runs every automated check. E2E (Maestro) is opt-in: E2E_PLATFORM=android ./scripts/verify.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/muse-mobile"
FUNCTIONS_DIR="$ROOT_DIR/firebase/functions"

printf "== App: lint, typecheck, unit tests ==\n"
(cd "$APP_DIR" && npm run lint && npm run typecheck && npm run test:unit)

printf "== Website: planner constraints, sharing and campaign expiry ==\n"
node --test "$ROOT_DIR"/apps/web/test/*.test.mjs

printf "== Functions: lint, typecheck, unit tests, build ==\n"
(cd "$FUNCTIONS_DIR" && npm run lint && npm run typecheck && npm test && npm run build)

printf "== Security rules (Firestore + Storage emulators) ==\n"
# Own ports (firebase.verify.json) and a private temp folder, so tests can run while a
# test server or dev emulators are up: every Storage emulator otherwise shares (and
# wipes) $TMPDIR/firebase/storage/blobs, and the hub locator file lives there too.
# (Short: the Functions emulator puts a Unix socket in it, capped at ~104 characters.)
QA_WORKSPACE="$(mktemp -d /tmp/muse-verify.XXXXXX)"
trap 'rm -rf "$QA_WORKSPACE"' EXIT
export TMPDIR="$QA_WORKSPACE/"
node "$ROOT_DIR/scripts/prepare-qa-emulators.cjs" "$QA_WORKSPACE"
# An isolated compiled Functions copy supplies disabled provider secrets. The real
# functions/.env and .secret.local are never changed or used for QA calls.
(cd "$QA_WORKSPACE" && firebase --config firebase.json emulators:exec --project demo-muse --only firestore,storage \
  "npm --prefix '$ROOT_DIR/firebase' run test:rules")

printf "== Cloud Functions end-to-end (Auth + Firestore + Functions + Storage emulators) ==\n"
(cd "$QA_WORKSPACE" && MUSE_FUNCTIONS_EMULATOR_HOST=127.0.0.1:15001 firebase --config firebase.json \
  emulators:exec --project demo-muse --only auth,firestore,functions,storage \
  "npm --prefix '$FUNCTIONS_DIR' run test:integration")

if [[ -n "${E2E_PLATFORM:-}" ]]; then
  printf "== E2E (Maestro on %s) ==\n" "$E2E_PLATFORM"
  "$ROOT_DIR/scripts/test-e2e.sh" "$E2E_PLATFORM"
fi

printf "\nAll checks passed.\n"
