#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# The Piped stack is the expensive part of the dev infra (~1 GB of images and a
# second Postgres), so it dies with this script instead of lingering after the
# dev servers are gone. `stop` rather than `down`: the containers keep their
# state, and `restart: unless-stopped` honours a manual stop, so they stay down
# across a reboot too. Postgres/Redis are left running on purpose — they are
# cheap and hold the BullMQ queue.
PIPED_SERVICES=(piped-backend piped-proxy piped-bg-helper piped-db)
stopped_piped=""

stop_piped() {
  if [ -n "$stopped_piped" ]; then
    return 0
  fi
  stopped_piped=1
  echo ""
  echo "Stopping Piped stack..."
  docker compose stop "${PIPED_SERVICES[@]}" >/dev/null 2>&1 || true
}

# A signal trap on its own would let the script resume at the next statement, so
# it has to exit explicitly; the EXIT trap then no-ops on the guard.
on_signal() {
  stop_piped
  exit 130
}

trap stop_piped EXIT
# HUP included so closing the terminal counts as closing the project.
trap on_signal INT TERM HUP

echo "Starting infrastructure..."
docker compose up -d postgres redis "${PIPED_SERVICES[@]}"

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