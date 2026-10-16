#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PYTHON="${PYTHON:-.venv/bin/python}"
if [[ ! -x "$PYTHON" || ! -d frontend/node_modules ]]; then
  echo 'Install dependencies first; see README.md.' >&2
  exit 1
fi
BACKEND_PID=''
FRONTEND_PID=''
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$BACKEND_PID" ]] || kill "$BACKEND_PID" 2>/dev/null || true
  [[ -z "$FRONTEND_PID" ]] || kill -- "-$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM
# Never terminate unrelated processes to claim a port. Bind privately by default.
"$PYTHON" -m uvicorn backend.main:app --host "${BACKEND_HOST:-127.0.0.1}" --port "${BACKEND_PORT:-8000}" &
BACKEND_PID=$!
(cd frontend; exec setsid npm run dev -- --hostname "${FRONTEND_HOST:-127.0.0.1}" --port "${FRONTEND_PORT:-3000}") &
FRONTEND_PID=$!
echo 'Starting DevPulse. No API key required for limited offline static checks.'
wait -n "$BACKEND_PID" "$FRONTEND_PID"
