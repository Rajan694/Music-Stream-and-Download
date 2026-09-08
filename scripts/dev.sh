#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Starting infrastructure..."
docker compose up -d postgres redis

echo "Waiting for services to be healthy..."
# Wait for postgres
until docker compose exec -T postgres pg_isready -U postgres -d music >/dev/null 2>&1; do
  sleep 1
done

# Wait for redis
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do
  sleep 1
done

echo "Running migrations..."
npm run db:migrate

echo "Starting development servers..."
npm run dev