#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8080}"

cd "$ROOT_DIR"

if [[ -z "${PORT:-}" || "$PORT" == "8080" ]]; then
  read -r -p "Введите порт для запуска [8080]: " INPUT_PORT
  INPUT_PORT="${INPUT_PORT:-8080}"
  if [[ "$INPUT_PORT" =~ ^[0-9]{2,5}$ ]] && (( INPUT_PORT >= 1 && INPUT_PORT <= 65535 )); then
    PORT="$INPUT_PORT"
  else
    echo "❌ Некорректный порт: $INPUT_PORT"
    exit 1
  fi
fi

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
