#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-$(node -p "require('./package.json').version")}"
OUT="$ROOT/vsix/ibm-member-opener-${VERSION}.vsix"

mkdir -p "$ROOT/vsix"
NODE_OPTIONS="" npm_config_node_options="" npx vsce package --no-dependencies --out "$OUT"
