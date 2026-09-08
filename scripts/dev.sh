#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Starting infrastructure..."
docker compose up -d postgres redis piped-db piped-bg-helper piped-backend piped-proxy

echo "Waiting for services to be healthy..."
# Wait for postgres
until docker compose exec -T postgres pg_isready -U postgres -d music >/dev/null 2>&1; do
  sleep 1
done

# Wait for redis
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do
  sleep 1
done

# Wait for Piped backend readiness (config endpoint) up to 180s
max_wait=180
elapsed=0
while true; do
  if curl -sf http://localhost:7081/config > /dev/null; then
    echo "Piped ready"
    break
  fi
  if [ $elapsed -ge $max_wait ]; then
    echo "Piped not ready after $max_wait seconds, proceeding"
    break
  fi
  sleep 2
  elapsed=$((elapsed+2))
done

echo "Running migrations..."
npm run db:migrate

echo "Starting development servers..."
npm run dev