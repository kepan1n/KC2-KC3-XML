#!/usr/bin/env bash
set -euo pipefail
PORT="${1:-4173}"
cd "$(dirname "$0")/.."
exec python3 scripts/run_local_server.py "$PORT"
