#!/usr/bin/env bash
set -euo pipefail

ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)")"
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
python -m pip install --upgrade pip setuptools wheel >/dev/null

if ! python -m pip install -r "$ROOT/requirements.txt"; then
  echo
  echo "Primary pip install failed. Retrying lxml from source..."
  python -m pip install 'openpyxl>=3.1,<4'
  python -m pip install --no-binary lxml 'lxml>=6,<7'
fi

if command -v ufw >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then
    sudo ufw allow "${PORT}/tcp" || true
  else
    ufw allow "${PORT}/tcp" || true
  fi
fi

echo
echo "KC2-KC3-XML is starting..."
echo "Local URL:   http://127.0.0.1:${PORT}/variants/modern-light/"
echo "Network URL: http://<this-host-ip>:${PORT}/variants/modern-light/"
echo

exec python "$ROOT/scripts/run_local_server.py" "$PORT"
