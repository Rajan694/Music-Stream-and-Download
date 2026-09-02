# ── Stage 1: Install dependencies & build ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install npm workspaces at root level first (layer caching).
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json   packages/db/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json      apps/api/
RUN npm install --ignore-scripts --workspaces --include-workspace-root

# Copy all source files.
COPY packages/shared/ packages/shared/
COPY packages/db/     packages/db/
COPY packages/config/ packages/config/
COPY apps/api/        apps/api/

# Generate Prisma client, build shared, then build the API.
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npm run build -w packages/shared
RUN npm run build -w apps/api

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache tini

WORKDIR /app

# Non-root user.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy dist + node_modules needed at runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/db/package.json packages/db/
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/package.json apps/api/
COPY --from=builder /app/packages/db/prisma packages/db/prisma

# Run migrations on startup (safe in dev; in prod you'd run this as a job).
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

ENV NODE_ENV=production
ENV API_PORT=4000

EXPOSE 4000

USER appuser

ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
