#!/usr/bin/env bash
# Creates the Google Play *upload* key for Muse and a git-ignored keystore.properties.
#
# Google Play App Signing holds the real app-signing key; this upload key only
# proves uploads come from you. Keep it, and its passwords, backed up somewhere
# safe (password manager + offline copy). If it is lost, Play support can reset
# it, but that takes days.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$ROOT_DIR/apps/muse-mobile"
KEY_DIR="${MUSE_KEY_DIR:-$HOME/.muse-keys}"
KEYSTORE="$KEY_DIR/muse-upload.jks"
ALIAS="muse-upload"
PROPS="$APP_DIR/keystore.properties"

KEYTOOL="keytool"
if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/keytool" ]]; then
  KEYTOOL="$JAVA_HOME/bin/keytool"
fi
command -v "$KEYTOOL" >/dev/null 2>&1 || { echo "keytool not found. Install JDK 17 and set JAVA_HOME."; exit 1; }

if [[ -f "$KEYSTORE" ]]; then
  echo "An upload keystore already exists at $KEYSTORE. Refusing to overwrite it."
  exit 1
fi

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

read -r -s -p "Choose a keystore password (min 12 characters): " STORE_PASS; echo
read -r -s -p "Repeat it: " STORE_PASS_CONFIRM; echo
if [[ "$STORE_PASS" != "$STORE_PASS_CONFIRM" || ${#STORE_PASS} -lt 12 ]]; then
  echo "Passwords must match and be at least 12 characters."
  exit 1
fi
read -r -p "Your name or company for the certificate (e.g. Muse Labs): " DNAME_ORG
read -r -p "Two-letter country code (e.g. IN): " DNAME_COUNTRY

"$KEYTOOL" -genkeypair -v \
  -storetype PKCS12 \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$STORE_PASS" -keypass "$STORE_PASS" \
  -dname "CN=${DNAME_ORG}, O=${DNAME_ORG}, C=${DNAME_COUNTRY}"
chmod 600 "$KEYSTORE"

umask 177
cat > "$PROPS" <<PROPERTIES
# Upload key for Google Play (git-ignored). Created by scripts/android/create-upload-keystore.sh
storeFile=$KEYSTORE
storePassword=$STORE_PASS
keyAlias=$ALIAS
keyPassword=$STORE_PASS
PROPERTIES

echo
echo "Upload key created: $KEYSTORE"
echo "Signing config written: $PROPS (never commit this file)"
echo "Back up BOTH the .jks file and the password now."
echo
echo "Upload certificate fingerprints (add the SHA-1/SHA-256 to Firebase if you later use Google sign-in or App Check):"
"$KEYTOOL" -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass "$STORE_PASS" | grep -E "SHA1:|SHA256:"
