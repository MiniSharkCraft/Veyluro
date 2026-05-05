#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ENV_FILE="$ROOT_DIR/apps/web/.env.local"
MOBILE_ENV_FILE="$ROOT_DIR/apps/mobile2/.env"
MOBILE_APP_JSON="$ROOT_DIR/apps/mobile2/app.json"

prompt_default() {
  local label="$1"
  local default="$2"
  local value
  read -r -p "$label [$default]: " value
  if [[ -z "${value}" ]]; then
    value="$default"
  fi
  printf '%s' "$value"
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

echo "=== MesSmini App Setup Wizard ==="

app_name="$(prompt_default "APP_NAME" "AMoon Eclipse")"
app_id="$(prompt_default "APP_ID" "official")"
api_base="$(prompt_default "API_BASE_URL" "http://localhost:8080")"
ws_base="$(prompt_default "WS_BASE_URL" "${api_base/http/ws}")"
android_package="$(prompt_default "Android package" "com.amoon.eclipse")"
ios_bundle_id="$(prompt_default "iOS bundleIdentifier" "com.amoon.eclipse")"
scheme_default="$(slugify "$app_name")"
app_scheme="$(prompt_default "Deep link scheme" "$scheme_default")"
app_slug="$(prompt_default "Expo slug" "$scheme_default")"

cat > "$WEB_ENV_FILE" <<EOF
VITE_APP_ID=$app_id
VITE_API_BASE_URL=$api_base
VITE_WS_BASE_URL=$ws_base
VITE_APP_NAME=$app_name
EOF
echo "Đã ghi $WEB_ENV_FILE"

cat > "$MOBILE_ENV_FILE" <<EOF
EXPO_PUBLIC_APP_ID=$app_id
EXPO_PUBLIC_API_URL=$api_base
EXPO_PUBLIC_WS_BASE_URL=$ws_base
EXPO_PUBLIC_APP_NAME=$app_name
EOF
echo "Đã ghi $MOBILE_ENV_FILE"

node -e '
const fs = require("fs");
const file = process.argv[1];
const appName = process.argv[2];
const slug = process.argv[3];
const scheme = process.argv[4];
const androidPackage = process.argv[5];
const iosBundleId = process.argv[6];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
data.expo = data.expo || {};
data.expo.name = appName;
data.expo.slug = slug;
data.expo.scheme = scheme;
data.expo.android = data.expo.android || {};
data.expo.android.package = androidPackage;
data.expo.ios = data.expo.ios || {};
data.expo.ios.bundleIdentifier = iosBundleId;
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
' "$MOBILE_APP_JSON" "$app_name" "$app_slug" "$app_scheme" "$android_package" "$ios_bundle_id"
echo "Đã update $MOBILE_APP_JSON"

target="$(prompt_default "Build target (none|web|desktop|apk)" "none")"
case "$target" in
  web)
    (cd "$ROOT_DIR" && npm run build --workspace=apps/web)
    ;;
  desktop)
    (cd "$ROOT_DIR" && npm run build --workspace=apps/desktop)
    ;;
  apk)
    (cd "$ROOT_DIR" && npm run build:apk --workspace=apps/mobile2)
    ;;
  none)
    ;;
  *)
    echo "Bỏ qua build (target không hợp lệ)."
    ;;
esac

echo "Xong."
