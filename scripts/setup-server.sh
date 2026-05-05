#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/packages/server"
ENV_FILE="$SERVER_DIR/.env"

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

prompt_required() {
  local label="$1"
  local value=""
  while [[ -z "$value" ]]; do
    read -r -p "$label: " value
  done
  printf '%s' "$value"
}

prompt_secret_default() {
  local label="$1"
  local default="$2"
  local value
  read -r -s -p "$label [$default]: " value
  echo
  if [[ -z "${value}" ]]; then
    value="$default"
  fi
  printf '%s' "$value"
}

gen_hex32() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    printf 'CHANGE_ME_64_HEX_CHARS'
  fi
}

echo "=== MesSmini Server Setup Wizard ==="

port="$(prompt_default "PORT" "8080")"
env_name="$(prompt_default "ENV (development|production)" "production")"
db_dsn="$(prompt_required "DB_DSN (mysql://... hoặc user:pass@tcp(host:3306)/db?parseTime=true)")"
jwt_secret="$(prompt_required "JWT_SECRET")"

default_enc_key="$(gen_hex32)"
db_encryption_key="$(prompt_secret_default "DB_ENCRYPTION_KEY (64 hex)" "$default_enc_key")"

default_hmac_key="$(gen_hex32)"
db_hmac_key="$(prompt_secret_default "DB_HMAC_KEY (64 hex)" "$default_hmac_key")"

allowed_origins="$(prompt_default "ALLOWED_ORIGINS (comma-separated)" "*")"
hmac_signing_key="$(prompt_default "HMAC_SIGNING_KEY (optional, để trống = disable integrity)" "")"
expected_app_sums="$(prompt_default "EXPECTED_APP_SUMS (optional, comma-separated)" "")"

mkdir -p "$SERVER_DIR"
umask 077
cat > "$ENV_FILE" <<EOF
PORT=$port
ENV=$env_name
DB_DSN=$db_dsn
JWT_SECRET=$jwt_secret
DB_ENCRYPTION_KEY=$db_encryption_key
DB_HMAC_KEY=$db_hmac_key
ALLOWED_ORIGINS=$allowed_origins
HMAC_SIGNING_KEY=$hmac_signing_key
EXPECTED_APP_SUMS=$expected_app_sums
EOF

echo "Đã ghi config: $ENV_FILE"
build_now="$(prompt_default "Build server ngay?" "y")"
if [[ "$build_now" =~ ^[Yy]$ ]]; then
  bash "$SERVER_DIR/build.sh"
fi

echo "Xong."
