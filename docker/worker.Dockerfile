# ── Stage 1: Install dependencies & build ─────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install npm workspaces at root level first (layer caching).
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json   packages/db/
COPY packages/config/package.json packages/config/
COPY worker/package.json        worker/
RUN npm install --ignore-scripts --workspaces --include-workspace-root

COPY packages/shared/ packages/shared/
COPY packages/db/     packages/db/
COPY packages/config/ packages/config/
COPY worker/          worker/

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npm run build -w packages/shared
RUN npm run build -w packages/db
RUN npm run build -w worker

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:22-alpine AS production

# ffmpeg and yt-dlp are the pipeline; tini reaps the processes it spawns.
RUN apk add --no-cache tini ffmpeg yt-dlp

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/db/package.json packages/db/
COPY --from=builder /app/packages/db/prisma packages/db/prisma
COPY --from=builder /app/worker/dist worker/dist
COPY --from=builder /app/worker/package.json worker/

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

# Shared with the backend container via the worker_tmp volume.
RUN mkdir -p /tmp/music-media && chown -R appuser:appgroup /tmp/music-media

ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV YT_DLP_PATH=/usr/bin/yt-dlp
ENV MEDIA_TEMP_DIR=/tmp/music-media

USER appuser

ENTRYPOINT ["tini", "--"]
CMD ["node", "worker/dist/main.js"]
