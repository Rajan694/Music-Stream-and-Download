#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  echo "Usage: $0 {up|down|logs|rebuild}"
  exit 1
}

if [ $# -eq 0 ]; then
  usage
fi

case "$1" in
  up)
    docker compose --profile prod up -d
    ;;
  down)
    docker compose --profile prod down
    ;;
  logs)
    docker compose --profile prod logs -f
    ;;
  rebuild)
    docker compose --profile prod build --no-cache
    docker compose --profile prod up -d
    ;;
  *)
    usage
    ;;
esac