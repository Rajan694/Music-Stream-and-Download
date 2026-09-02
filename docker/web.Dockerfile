# ── Stage 1: Install dependencies & build ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install npm workspaces at root level first (layer caching).
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm install --ignore-scripts --workspaces --include-workspace-root

# Copy source files.
COPY packages/shared/ packages/shared/
COPY apps/web/        apps/web/

# Build shared first, then Next.js (standalone output).
RUN npm run build -w packages/shared
RUN npm run build -w apps/web

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache tini

WORKDIR /app

# Non-root user.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy the standalone output produced by `next build`.
# Structure: .next/standalone/ + .next/static/ + public/
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static    ./apps/web/.next/static
COPY --from=builder /app/apps/web/public          ./apps/web/public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

USER appuser

ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/web/server.js"]
