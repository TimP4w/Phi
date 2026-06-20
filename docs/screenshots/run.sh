#!/usr/bin/env bash
# Regenerate the README screenshots (docs/*.png, except mcp.png).
# Runs the Vite dev server on a throwaway port and drives it with Playwright
# against fully mocked API/WebSocket data — no cluster or backend needed.
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$dir/../.." && pwd)"
port="${PORT:-5180}"

cd "$dir"
[ -d node_modules ] || npm install

: "${CHROMIUM:=$(command -v chromium || true)}"
export CHROMIUM
[ -n "$CHROMIUM" ] || { echo "chromium not found; run inside 'nix develop' or set CHROMIUM"; exit 1; }

( cd "$repo/web" && yarn dev --port "$port" >"$dir/vite.log" 2>&1 ) &
vite=$!
trap 'kill "$vite" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  curl -sf "http://localhost:$port/" >/dev/null 2>&1 && break
  sleep 1
done

BASE="http://localhost:$port" OUT="$repo/docs" node shoot.mjs
