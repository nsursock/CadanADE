#!/usr/bin/env bash
# Launch Electron with ELECTRON_RUN_AS_NODE unset (VS Code / some CLIs set it).
# Prefer the local package binary over `npx` (avoids npm env-config noise).
set -euo pipefail

cd "$(dirname "$0")/.."

node ./scripts/ensure-electron.js

ELECTRON_BIN="./node_modules/.bin/electron"
if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "Electron CLI missing. From the repo root run: pnpm install" >&2
  exit 1
fi

env -u ELECTRON_RUN_AS_NODE "$ELECTRON_BIN" .
