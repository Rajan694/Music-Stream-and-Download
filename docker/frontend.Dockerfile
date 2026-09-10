FROM ghcr.io/cirruslabs/flutter:3.24.0 AS builder

WORKDIR /app
COPY frontend/app/ ./

RUN flutter pub get
RUN flutter build web --release

FROM nginx:alpine AS production

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build/web /usr/share/nginx/html

EXPOSE 80