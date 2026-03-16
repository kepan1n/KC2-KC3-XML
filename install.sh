#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
HOST="${HOST:-0.0.0.0}"
PORT_ENV_SET=0
if [[ -n "${PORT+x}" ]]; then
  PORT_ENV_SET=1
fi
PORT="${PORT:-8080}"

cd "$ROOT_DIR"

if [[ "$PORT" =~ ^[0-9]{1,5}$ ]] && (( 10#$PORT >= 1 && 10#$PORT <= 65535 )); then
  :
else
  echo "❌ Некорректный порт: $PORT"
  exit 1
fi

# Спрашиваем порт только в интерактивном запуске и только если PORT не передан извне.
if [[ -t 0 && "$PORT_ENV_SET" -eq 0 ]]; then
  read -r -p "Введите порт для запуска [${PORT}]: " INPUT_PORT
  INPUT_PORT="${INPUT_PORT:-$PORT}"
  if [[ "$INPUT_PORT" =~ ^[0-9]{1,5}$ ]] && (( 10#$INPUT_PORT >= 1 && 10#$INPUT_PORT <= 65535 )); then
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
