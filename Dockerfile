# syntax=docker/dockerfile:1.7
FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm build

FROM golang:1.25.7-alpine3.23@sha256:f6751d823c26342f9506c03797d2527668d095b0a15f1862cddb4d927a7a4ced AS health-build
WORKDIR /src
COPY docker/healthcheck.go .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /healthcheck healthcheck.go

FROM nginx:1.29.5-alpine3.23-slim@sha256:032dcd5e58c2a6e767fa8b7bbaa74554fd62e8fd5614fe4f019a05dfba7be8d9 AS nginx-files

FROM scratch AS runtime
ARG VERSION=0.1.0
ARG VCS_REF=unknown
ARG SOURCE_URL=https://example.invalid/garment-factory-saas
LABEL org.opencontainers.image.title="Garment Factory SaaS frontend" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.source="$SOURCE_URL"
COPY --from=nginx-files /etc/passwd /etc/group /etc/
COPY --from=nginx-files /etc/nginx/mime.types /etc/nginx/mime.types
COPY --from=nginx-files /usr/sbin/nginx /usr/sbin/nginx
COPY --from=nginx-files /lib /lib
COPY --from=nginx-files /usr/lib /usr/lib
COPY --from=build --chown=101:101 /workspace/dist /usr/share/nginx/html
COPY --chown=101:101 frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=health-build --chown=101:101 /healthcheck /healthcheck
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=12 CMD ["/healthcheck", "http://127.0.0.1:8080/nginx-health"]
ENTRYPOINT ["/usr/sbin/nginx", "-e", "/dev/stderr", "-g", "daemon off;"]
