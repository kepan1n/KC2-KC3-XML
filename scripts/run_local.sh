#!/usr/bin/env bash
set -euo pipefail
PORT="${1:-4173}"
cd "$(dirname "$0")/.."
echo "Serving KC2-KC3-XML on http://127.0.0.1:${PORT}"
python3 -m http.server "$PORT"
