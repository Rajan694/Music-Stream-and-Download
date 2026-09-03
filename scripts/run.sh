#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

cmd="${1:-dev}"

case "$cmd" in
  build)
    npm run build -w packages/shared
    npm run build -w packages/db
    npm run build -w apps/api
    npm run build -w apps/worker
    npm run build -w apps/web
    ;;
  lint)
    npm run lint -w packages/shared
    npm run lint -w packages/db
    npm run lint -w apps/api
    npm run lint -w apps/worker
    npm run lint -w apps/web
    ;;
  dev)
    npm run build -w packages/shared
    npm run build -w packages/db
    trap 'kill 0' EXIT
    (npm run build -w packages/shared -- --watch) &
    (npm run build -w packages/db -- --watch) &
    (npm run dev -w apps/api) &
    (npm run dev -w apps/worker) &
    (npm run dev -w apps/web) &
    wait
    ;;
  *)
    echo "Unknown command: $cmd (use: dev | build | lint)" >&2
    exit 1
    ;;
esac
