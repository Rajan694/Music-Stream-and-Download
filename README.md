# Music-Stream-and-Download

A music streaming and download application built with Vite + React + Express + BullMQ.

## Tech Stack

- **Frontend**: Vite + React 19 + React Router 7 + Tailwind CSS v4 + TanStack Query + Zustand
- **Backend**: Express 5 + TypeScript + jose (JWT) + BullMQ + ioredis
- **Worker**: BullMQ worker + yt-dlp + ffmpeg pipeline
- **Database**: PostgreSQL + Prisma ORM
- **Queue**: BullMQ on Redis
- **Cache**: Redis (metadata) + in-memory fallback

## Project Structure

```
frontend/            Vite + React + React Router + Tailwind v4
backend/             Express 5 + TypeScript (ESM)
worker/              BullMQ worker + yt-dlp/ffmpeg pipeline
packages/shared/     Zod contracts (types, schemas)
packages/db/         Prisma client + migrations
packages/config/     tsconfig/eslint/prettier bases
docker/              Dockerfiles + nginx.conf
scripts/             Shell + PowerShell wrappers
compose.yaml         Docker Compose for dev/prod
```

## Quick Start

```bash
# One-time setup (installs deps, generates Prisma, builds shared/db)
./scripts/setup.sh

# Start infrastructure + dev servers
./scripts/dev.sh

# Or on Windows:
./scripts/setup.ps1
./scripts/dev.ps1
```

This starts:
- Frontend at http://localhost:3000
- Backend API at http://localhost:4000/api/v1
- Worker (background downloads)
- PostgreSQL at localhost:5436
- Redis at localhost:6380

## Environment Variables

Copy `.env.example` to `.env` and fill in:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — min 32 chars (`openssl rand -base64 48`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for OAuth (optional)
- `PIPED_API_URL` — Piped instance for metadata (default: https://api.piped.private.coffee)
- `REDIS_URL` — backs both the metadata cache and the job queue. The backend
  enqueues here and the worker consumes from here, so both must resolve to the
  same instance (`docker compose` publishes Redis on **6380**).

## Docker (Production)

```bash
# Build all images
./scripts/docker.sh build

# Start production stack
./scripts/docker.sh up
```

Frontend served by nginx on port 3000, API on 4000, worker with resource limits.

## Development Commands

```bash
npm run dev          # Start all dev servers (with concurrently)
npm run build        # Build all packages + frontend
npm run typecheck    # TypeScript project references check
npm run lint         # ESLint all packages
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio
```

## Architecture Notes

- **Frontend** is a pure SPA (no SSR). All 22 components use client-side rendering.
- **Backend** runs on Express 5 with manual composition root (no DI container).
- **Auth** uses access tokens (15m) in memory + rotating refresh tokens (30d) in httpOnly cookies.
- **Downloads** use BullMQ on Redis for queueing; Postgres remains source of truth.
- **Worker** processes downloads sequentially per playlist, parallel across jobs.
- **Media** resolves via Piped (fast) or yt-dlp (fallback), transcodes with ffmpeg.

## Windows Notes

- Install ffmpeg and add to PATH, or set `FFMPEG_PATH`.
- yt-dlp binary resolves to `yt-dlp.exe` automatically.
- Argon2 and Prisma need MSVC build tools — install the "Desktop development with
  C++" workload from Visual Studio Build Tools.
- Use Docker Desktop with WSL2 backend for Compose services.