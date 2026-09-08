#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Check Node version
if ! command -v node &> /dev/null; then
  echo "Node.js not found. Please install Node.js >= 20"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js >= 20 required (found v$NODE_MAJOR)"
  exit 1
fi

echo "Installing dependencies..."
# engine-strict=true in .npmrc trips on a Prisma transitive dep that wants
# node >=22. Harmless on node 20, so opt out rather than block setup.
npm install --no-engine-strict

echo "Generating Prisma client..."
npm run db:generate

echo "Building shared and db packages..."
npm run build -w packages/shared
npm run build -w packages/db

if [ ! -f .env ]; then
  echo "Copying .env.example to .env..."
  cp .env.example .env
fi

echo "Setup complete. Run 'npm run dev' to start development."