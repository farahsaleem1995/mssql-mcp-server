#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-all.sh — Starts one MCP server instance per .env file in instances/
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTANCES_DIR="$SCRIPT_DIR/instances"
PIDS_FILE="$SCRIPT_DIR/.pids"

# Clean up stale PID file
> "$PIDS_FILE"

# Count how many env files we have (excluding example)
ENV_FILES=("$INSTANCES_DIR"/*.env)
ACTIVE_FILES=()

for env_file in "${ENV_FILES[@]}"; do
  filename="$(basename "$env_file")"
  # Skip the example template
  if [[ "$filename" == "example.env" ]]; then
    continue
  fi
  ACTIVE_FILES+=("$env_file")
done

if [[ ${#ACTIVE_FILES[@]} -eq 0 ]]; then
  echo "No .env files found in instances/ (excluding example.env)"
  echo "Copy instances/example.env to instances/yourdb.env and configure it."
  exit 1
fi

echo "Starting ${#ACTIVE_FILES[@]} MCP server instance(s)..."
echo ""

for env_file in "${ACTIVE_FILES[@]}"; do
  instance_name="$(basename "$env_file" .env)"

  # Extract port for display
  port=$(grep -E '^MCP_PORT=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
  db=$(grep -E '^DB_DATABASE=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')

  echo "  ▸ $instance_name (db: ${db:-unknown}, port: ${port:-?})"

  # Start in background, redirect output to log file
  npx tsx src/index.ts --env-file "$env_file" \
    > "$SCRIPT_DIR/instances/${instance_name}.log" 2>&1 &

  pid=$!
  echo "$pid $instance_name" >> "$PIDS_FILE"
done

echo ""
echo "All instances started. PIDs saved to .pids"
echo "Logs: instances/<name>.log"
echo "Stop all: ./stop-all.sh"
