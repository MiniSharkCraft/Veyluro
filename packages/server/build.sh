#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "📦 Building web frontend..."
cd "$ROOT_DIR/apps/web"
pnpm build

echo "📁 Copying web dist to server..."
mkdir -p "$SCRIPT_DIR/cmd/server/web"
rm -rf "$SCRIPT_DIR/cmd/server/web"/*
cp -r dist/* "$SCRIPT_DIR/cmd/server/web/"

echo "🔨 Building Go server..."
cd "$SCRIPT_DIR"
go build -ldflags="-s -w" -o amoon-server ./cmd/server

echo "✅ Done! Binary: packages/server/amoon-server"
