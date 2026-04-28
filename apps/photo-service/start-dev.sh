#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Init pyenv
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

PADDLE_DIR="$DIR/gpu-services/service1-paddle"
SURYA_DIR="$DIR/gpu-services/service2-surya"

echo "=== Starting infrastructure (Postgres + Redis) ==="
docker compose up -d --wait

echo "=== Running Prisma migrations ==="
npx prisma migrate deploy 2>/dev/null || npx prisma migrate dev --name init
echo "=== Generating Prisma client ==="
npx prisma generate

echo "=== Starting NestJS app ==="
npm run start:dev &
PID_APP=$!

echo "=== Starting PaddleOCR worker ==="
(cd "$PADDLE_DIR" && source .venv/bin/activate && python3 -m app.main) &
PID_PADDLE=$!

echo "=== Starting Surya worker ==="
(cd "$SURYA_DIR" && source .venv/bin/activate && python3 -m app.main) &
PID_SURYA=$!

echo ""
echo "=== All services started ==="
echo "  NestJS:  http://localhost:3000"
echo "  Paddle:  PID $PID_PADDLE"
echo "  Surya:   PID $PID_SURYA"
echo ""
echo "Press Ctrl+C to stop everything"

cleanup() {
  echo ""
  echo "=== Stopping all services ==="
  kill $PID_APP $PID_PADDLE $PID_SURYA 2>/dev/null
  wait 2>/dev/null
  echo "=== Done ==="
}

trap cleanup EXIT INT TERM
wait
