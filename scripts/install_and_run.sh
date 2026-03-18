#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv"
PORT="${1:-4173}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found" >&2
  exit 1
fi

if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi

source "$VENV/bin/activate"
python -m pip install --upgrade pip >/dev/null
python -m pip install -r "$ROOT/requirements.txt"

echo
echo "KC2-KC3-XML is starting..."
echo "URL: http://127.0.0.1:${PORT}/variants/modern-light/"
echo

exec python "$ROOT/scripts/run_local_server.py" "$PORT"
