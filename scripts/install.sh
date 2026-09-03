#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm install --no-engine-strict
npm run db:generate
npm run build -w packages/shared
npm run build -w packages/db
