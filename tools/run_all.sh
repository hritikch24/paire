#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_ROOT="$ROOT_DIR/artifacts"
RUN_DIR="$ARTIFACTS_ROOT/$(date +%Y-%m-%d_%H-%M-%S)"
MOBILE_DIR="$ROOT_DIR/apps/muse-mobile"
ANDROID_DIR="$MOBILE_DIR/android"

mkdir -p "$RUN_DIR"

log() {
  printf "[%s] %s\n" "$(date +%H:%M:%S)" "$*" | tee -a "$RUN_DIR/run_all.log"
}

grep_q() {
  local pattern="$1"
  grep -qE "$pattern"
}

set_default_env() {
  if [[ -z "${ANDROID_HOME:-}" && -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  fi

  # Force a stable JDK for Gradle/Android builds (React Native tooling is tested on JDK 17).
  if [[ -x "$HOME/Applications/temurin-17/Contents/Home/bin/java" ]]; then
    export JAVA_HOME="$HOME/Applications/temurin-17/Contents/Home"
    export PATH="$JAVA_HOME/bin:$PATH"
  else
    JAVA_17_CANDIDATES=()
    if [[ -x /usr/libexec/java_home ]]; then
      JAVA_17_CANDIDATES+=("$(/usr/libexec/java_home -v 17 2>/dev/null || true)")
    fi
    JAVA_17_CANDIDATES+=("/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home")
    JAVA_17_CANDIDATES+=("/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home")

    for candidate in "${JAVA_17_CANDIDATES[@]}"; do
      if [[ -n "$candidate" && -x "$candidate/bin/java" ]]; then
        export JAVA_HOME="$candidate"
        export PATH="$JAVA_HOME/bin:$PATH"
        break
      fi
    done
  fi

  if [[ -n "${ANDROID_HOME:-}" && -x "$ANDROID_HOME/platform-tools/adb" ]]; then
    export PATH="$ANDROID_HOME/platform-tools:$PATH"
  fi
}

set_default_env

log "Repo: $ROOT_DIR"
log "Artifacts: $RUN_DIR"
log "JAVA_HOME: ${JAVA_HOME:-<unset>}"

log "Node: $(node -v)"
log "npm: $(npm -v)"

if command -v java >/dev/null 2>&1; then
  java -version 2>&1 | tee -a "$RUN_DIR/java-version.txt" >/dev/null
  log "Java: captured in $RUN_DIR/java-version.txt"
else
  log "ERROR: java not found. Install JDK 17 and/or set JAVA_HOME."
  exit 1
fi

if [[ ! -d "$ANDROID_DIR" ]]; then
  log "ERROR: Android project not found at $ANDROID_DIR"
  exit 1
fi

if [[ -x "$ANDROID_DIR/gradlew" ]]; then
  (cd "$ANDROID_DIR" && ./gradlew -v) >"$RUN_DIR/gradle-version.txt" 2>&1 || true
  log "Gradle: captured in $RUN_DIR/gradle-version.txt"
else
  log "ERROR: gradlew not found at $ANDROID_DIR/gradlew"
  exit 1
fi

log "Step: Typecheck"
(cd "$MOBILE_DIR" && npm run -s typecheck) >"$RUN_DIR/typecheck.log" 2>&1 || {
  log "Typecheck FAILED. See $RUN_DIR/typecheck.log"
  tail -n 80 "$RUN_DIR/typecheck.log" | tee -a "$RUN_DIR/run_all.log"
  exit 1
}
log "Typecheck OK"

log "Step: Unit tests (Jest)"
(cd "$MOBILE_DIR" && npm run -s test:unit) >"$RUN_DIR/unit-tests.log" 2>&1 || {
  log "Unit tests FAILED. See $RUN_DIR/unit-tests.log"
  tail -n 80 "$RUN_DIR/unit-tests.log" | tee -a "$RUN_DIR/run_all.log"
  exit 1
}
log "Unit tests OK"

if [[ -z "${ANDROID_HOME:-}" ]]; then
  log "ERROR: ANDROID_HOME is not set and default SDK path was not found."
  log "Install Android SDK or set ANDROID_HOME. Expected: $HOME/Library/Android/sdk"
  exit 1
fi

LOCAL_PROPS="$ANDROID_DIR/local.properties"
if [[ ! -f "$LOCAL_PROPS" ]]; then
  log "Writing $LOCAL_PROPS (sdk.dir)"
  printf "sdk.dir=%s\n" "$ANDROID_HOME" >"$LOCAL_PROPS"
fi

GRADLE_TASKS=("assembleDebug" "testDebugUnitTest")
if [[ "${MUSE_CLEAN:-}" == "true" ]]; then
  GRADLE_TASKS=("clean" "${GRADLE_TASKS[@]}")
fi

log "Step: Gradle ${GRADLE_TASKS[*]}"
(cd "$ANDROID_DIR" && ./gradlew "${GRADLE_TASKS[@]}") >"$RUN_DIR/gradle-build.log" 2>&1 || {
  log "Gradle build FAILED. See $RUN_DIR/gradle-build.log"
  tail -n 120 "$RUN_DIR/gradle-build.log" | tee -a "$RUN_DIR/run_all.log"
  exit 1
}
log "Gradle build OK"

DEBUG_APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$DEBUG_APK" ]]; then
  cp -f "$DEBUG_APK" "$RUN_DIR/app-debug.apk"
  log "Debug APK: $RUN_DIR/app-debug.apk"
else
  log "WARN: Debug APK not found at $DEBUG_APK"
fi

CONNECTED_TASK=""
if (cd "$ANDROID_DIR" && ./gradlew tasks --all) | grep_q "connectedDebugAndroidTest"; then
  CONNECTED_TASK="connectedDebugAndroidTest"
fi

if [[ -n "$CONNECTED_TASK" ]]; then
  if command -v adb >/dev/null 2>&1 && adb devices | grep_q "device$"; then
    log "Step: $CONNECTED_TASK"
    (cd "$ANDROID_DIR" && ./gradlew "$CONNECTED_TASK") >"$RUN_DIR/connected-tests.log" 2>&1 || {
      log "Connected tests FAILED. See $RUN_DIR/connected-tests.log"
      exit 1
    }
    log "Connected tests OK"
  else
    log "Skipping connected tests: no adb device detected."
  fi
else
  log "Skipping connected tests: task not present."
fi

log "DONE"
log "Outputs: $RUN_DIR"
