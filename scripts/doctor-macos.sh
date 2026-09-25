#!/usr/bin/env bash
set -euo pipefail

print_section() {
  printf "\n== %s ==\n" "$1"
}

print_kv() {
  printf "%-24s %s\n" "$1" "$2"
}

print_section "System"
print_kv "OS" "$(sw_vers -productVersion)"
print_kv "Arch" "$(uname -m)"

print_section "Xcode"
if xcode-select -p >/dev/null 2>&1; then
  print_kv "xcode-select" "$(xcode-select -p)"
else
  print_kv "xcode-select" "missing"
fi
if xcodebuild -version >/dev/null 2>&1; then
  print_kv "xcodebuild" "ok"
  xcodebuild -version | sed 's/^/  /'
else
  print_kv "xcodebuild" "missing or CLT-only"
  print_kv "hint" "Run: sudo xcode-select -s /Applications/Xcode.app"
fi

print_section "Node"
if command -v node >/dev/null 2>&1; then
  print_kv "node" "$(node -v)"
else
  print_kv "node" "missing"
fi
if command -v npm >/dev/null 2>&1; then
  print_kv "npm" "$(npm -v)"
else
  print_kv "npm" "missing"
fi

print_section "Homebrew"
if command -v brew >/dev/null 2>&1; then
  print_kv "brew" "$(brew --version | head -n1)"
else
  print_kv "brew" "missing"
fi

print_section "Android SDK"
print_kv "ANDROID_HOME" "${ANDROID_HOME:-}" 
print_kv "ANDROID_SDK_ROOT" "${ANDROID_SDK_ROOT:-}"
if command -v adb >/dev/null 2>&1; then
  print_kv "adb" "ok"
else
  print_kv "adb" "missing"
fi
if command -v sdkmanager >/dev/null 2>&1; then
  print_kv "sdkmanager" "ok"
else
  print_kv "sdkmanager" "missing"
fi

print_section "Mobile toolchain"
if command -v watchman >/dev/null 2>&1; then
  print_kv "watchman" "$(watchman --version)"
else
  print_kv "watchman" "missing"
fi
if command -v expo >/dev/null 2>&1; then
  print_kv "expo" "$(expo --version)"
else
  print_kv "expo" "missing"
fi
if command -v firebase >/dev/null 2>&1; then
  print_kv "firebase" "$(firebase --version)"
else
  print_kv "firebase" "missing"
fi
if command -v maestro >/dev/null 2>&1; then
  print_kv "maestro" "$(maestro --version)"
elif [ -x "$(dirname "$0")/../tools/maestro/bin/maestro" ]; then
  print_kv "maestro" "$("$(dirname "$0")/../tools/maestro/bin/maestro" --version | tail -n1)"
else
  print_kv "maestro" "missing"
fi

print_section "Notes"
echo "- This script is read-only."
echo "- If xcodebuild is missing, open Xcode once and accept the license."
