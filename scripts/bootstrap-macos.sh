#!/usr/bin/env bash
set -euo pipefail

say() {
  printf "\n== %s ==\n" "$1"
}

ensure_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew not found. Install from https://brew.sh/ then re-run."
    exit 1
  fi
}

ensure_brew

say "watchman"
if command -v watchman >/dev/null 2>&1; then
  echo "watchman already installed"
else
  brew install watchman
fi

say "expo tooling"
if command -v expo >/dev/null 2>&1; then
  echo "expo already installed"
else
  npm install -g expo
fi

echo "Note: you can also use npx expo to avoid global install."

say "firebase-tools"
if command -v firebase >/dev/null 2>&1; then
  echo "firebase-tools already installed"
else
  npm install -g firebase-tools
fi

say "android platform tools"
if command -v adb >/dev/null 2>&1; then
  echo "adb already available"
else
  brew install android-platform-tools
fi

say "maestro"
if command -v maestro >/dev/null 2>&1; then
  echo "maestro already installed"
else
  brew install maestro
fi

say "notes"
echo "- This script installs only missing tools."
echo "- No sudo is used."
echo "- To revert: use brew uninstall <pkg> or npm uninstall -g <pkg>."
