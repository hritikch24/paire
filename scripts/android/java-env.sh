# Sourced by the Android build scripts: React Native's Gradle toolchain needs
# JDK 17 (or 21). Newer JDKs fail with "Unsupported class file major version".
java_major() {
  "$1/bin/java" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1
}
supported_jdk() {
  [[ -n "$1" && -x "$1/bin/java" && "$(java_major "$1")" =~ ^(17|21)$ ]]
}
if ! supported_jdk "${JAVA_HOME:-}"; then
  # Note: `java_home -v 17` falls back to any installed JDK, so check each version.
  for candidate in \
    "$(/usr/libexec/java_home -v 17 2>/dev/null || true)" \
    /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
    /Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
    if supported_jdk "$candidate"; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi
if ! supported_jdk "${JAVA_HOME:-}"; then
  echo "JDK 17 not found. Install it with: brew install openjdk@17"
  exit 1
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
echo "Using JAVA_HOME=$JAVA_HOME"
