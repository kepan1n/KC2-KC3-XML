#!/usr/bin/env bash
set -euo pipefail
ROOT="$(dirname "$0")/.."
cd "$ROOT"

python3 -m http.server 4173 --directory variants/excel-like &
PID1=$!
python3 -m http.server 4174 --directory variants/modern-light &
PID2=$!
python3 -m http.server 4175 --directory variants/dark-dashboard &
PID3=$!

cleanup() {
  kill "$PID1" "$PID2" "$PID3" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Excel-like:      http://127.0.0.1:4173"
echo "Modern Light:    http://127.0.0.1:4174"
echo "Dark Dashboard:  http://127.0.0.1:4175"

echo "Press Ctrl+C to stop all three servers"
wait
