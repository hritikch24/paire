#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/muse-mobile"
FIREBASE_DIR="$ROOT_DIR/firebase"

printf "== Lint ==\n"
cd "$APP_DIR"
npm run lint

printf "== Typecheck ==\n"
npm run typecheck

printf "== Unit tests ==\n"
npm run test:unit

printf "== Firestore rules tests ==\n"
cd "$ROOT_DIR"
firebase emulators:exec --only firestore "npm --prefix $FIREBASE_DIR run test:rules"

printf "== E2E (Maestro) ==\n"
cd "$ROOT_DIR"
E2E_PLATFORM=${E2E_PLATFORM:-ios}
./scripts/test-e2e.sh "$E2E_PLATFORM"
