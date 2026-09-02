# ── Stage 1: Install dependencies & build ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install npm workspaces at root level first (layer caching).
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json   packages/db/
COPY packages/config/package.json packages/config/
COPY apps/worker/package.json   apps/worker/
RUN npm install --ignore-scripts --workspaces --include-workspace-root

# Copy all source files.
COPY packages/shared/ packages/shared/
COPY packages/db/     packages/db/
COPY packages/config/ packages/config/
COPY apps/worker/     apps/worker/

# Generate Prisma client, build shared, then build worker.
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npm run build -w packages/shared
RUN npm run build -w apps/worker

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

# Install runtime dependencies: ffmpeg (for transcoding) and yt-dlp (standalone
# binary, not the npm-vendored one which breaks on Node 20).
RUN apk add --no-cache tini ffmpeg yt-dlp

WORKDIR /app

# Non-root user.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create temp directory for in-flight downloads.
RUN mkdir -p /tmp/music-media && chown appuser:appgroup /tmp/music-media

# Copy dist + node_modules needed at runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/db/package.json packages/db/
COPY --from=builder /app/apps/worker/dist apps/worker/dist
COPY --from=builder /app/apps/worker/package.json apps/worker/
COPY --from=builder /app/packages/db/prisma packages/db/prisma

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

ENV NODE_ENV=production
ENV WORKER_MEDIA_TEMP_DIR=/tmp/music-media
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV YT_DLP_PATH=/usr/bin/yt-dlp

USER appuser

ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/worker/dist/main.js"]
