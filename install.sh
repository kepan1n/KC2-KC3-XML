#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8080}"

cd "$ROOT_DIR"

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Установка завершена"
echo "🚀 Запуск: http://localhost:${PORT}"
exec uvicorn app.main:app --host "$HOST" --port "$PORT" --reload
