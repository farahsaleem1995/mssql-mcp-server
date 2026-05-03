#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# stop-all.sh — Stops all running MCP server instances
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS_FILE="$SCRIPT_DIR/.pids"

if [[ ! -f "$PIDS_FILE" ]]; then
  echo "No .pids file found. Are any instances running?"
  exit 0
fi

echo "Stopping MCP server instances..."
echo ""

while IFS=' ' read -r pid name; do
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "  ■ $name (PID $pid) — stopped"
  else
    echo "  ○ $name (PID $pid) — already stopped"
  fi
done < "$PIDS_FILE"

rm -f "$PIDS_FILE"

echo ""
echo "All instances stopped."
