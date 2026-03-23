#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export OPENCODE_CONFIG="${OPENCODE_CONFIG:-$ROOT_DIR/infra/opencode/opencode.jsonc}"

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY is required"
  exit 1
fi

if [[ -z "${OPENCODE_SERVER_PASSWORD:-}" ]]; then
  echo "OPENCODE_SERVER_PASSWORD is required"
  exit 1
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi

  if [[ -n "${OPENCODE_PID:-}" ]]; then
    kill "$OPENCODE_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

echo "Starting OpenCode on 127.0.0.1:4096"
opencode serve --hostname 127.0.0.1 --port 4096 &
OPENCODE_PID=$!

echo "Starting API on 0.0.0.0:3001"
npm run dev --workspace @enterprise-demo/api &
API_PID=$!

wait -n "$OPENCODE_PID" "$API_PID"
EXIT_CODE=$?

echo "A backend process exited. Shutting down."
exit "$EXIT_CODE"
