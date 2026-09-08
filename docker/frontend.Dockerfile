FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/config/package.json packages/config/
COPY frontend/package.json frontend/
RUN npm install --ignore-scripts --workspaces --include-workspace-root

COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY packages/config/ packages/config/
COPY frontend/ frontend/

ARG VITE_API_URL=http://localhost:4000/api/v1
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build -w packages/shared && npm run build -w frontend

FROM nginx:alpine AS production

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80