FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/config/package.json packages/config/
COPY backend/package.json backend/
RUN npm install --ignore-scripts --workspaces --include-workspace-root

COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY packages/config/ packages/config/
COPY backend/ backend/

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npm run build -w packages/shared
RUN npm run build -w packages/db
RUN npm run build -w backend

FROM node:22-alpine AS production

# yt-dlp is a suggestions/metadata provider fallback here (the worker does the
# actual downloads); --ignore-scripts above skips youtube-dl-exec's postinstall,
# so the vendored binary never lands — install the system package instead.
RUN apk add --no-cache tini yt-dlp

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/db/package.json packages/db/
COPY --from=builder /app/backend/dist backend/dist
COPY --from=builder /app/backend/package.json backend/
COPY --from=builder /app/packages/db/prisma packages/db/prisma

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

ENV NODE_ENV=production
ENV API_PORT=4000
ENV YT_DLP_PATH=/usr/bin/yt-dlp

EXPOSE 4000

USER appuser

ENTRYPOINT ["tini", "--"]
CMD ["node", "backend/dist/main.js"]