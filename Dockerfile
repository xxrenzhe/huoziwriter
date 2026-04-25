FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat python3 py3-pip make g++
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/rendering/package.json packages/rendering/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN corepack enable && pnpm install --frozen-lockfile=false

FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat python3 py3-pip make g++ git cargo rust openssl-dev libxml2-dev libxslt-dev libffi-dev jpeg-dev zlib-dev
WORKDIR /app

ARG SEARXNG_REF=master
RUN mkdir -p /usr/local/searxng \
  && python3 -m venv /usr/local/searxng/searx-pyenv \
  && . /usr/local/searxng/searx-pyenv/bin/activate \
  && pip install -U pip setuptools wheel \
  && for attempt in 1 2 3; do \
    git clone --depth 1 --branch "$SEARXNG_REF" https://github.com/searxng/searxng /usr/local/searxng/searxng-src && break; \
    if [ "$attempt" = "3" ]; then exit 1; fi; \
    rm -rf /usr/local/searxng/searxng-src; \
    sleep $((attempt * 5)); \
  done \
  && cd /usr/local/searxng/searxng-src \
  && pip install -r requirements.txt -r requirements-server.txt \
  && pip install --no-build-isolation -e . \
  && python -m searx.version freeze \
  && find /usr/local/searxng/searx-pyenv -type d -name '__pycache__' -prune -exec rm -rf {} + \
  && rm -rf /root/.cache/pip /usr/local/searxng/searxng-src/.git

COPY --from=deps /app /app
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && NEXT_OUTPUT_MODE=standalone pnpm --filter @huoziwriter/web build
RUN mkdir -p /tmp/runtime-node_modules \
  && cp -R /app/node_modules/.pnpm/bcryptjs@*/node_modules/bcryptjs /tmp/runtime-node_modules/bcryptjs \
  && cp -R /app/node_modules/.pnpm/postgres@*/node_modules/postgres /tmp/runtime-node_modules/postgres \
  && cp -R /app/node_modules/.pnpm/bindings@*/node_modules/bindings /tmp/runtime-node_modules/bindings \
  && cp -R /app/node_modules/.pnpm/file-uri-to-path@*/node_modules/file-uri-to-path /tmp/runtime-node_modules/file-uri-to-path \
  && cp -R /app/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 /tmp/runtime-node_modules/better-sqlite3

FROM node:22-alpine AS runner

RUN apk add --no-cache nginx supervisor python3 py3-pip libc6-compat valkey libxml2 libxslt libstdc++ openssl ca-certificates
WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /tmp/runtime-node_modules ./node_modules
COPY --from=builder /usr/local/searxng /usr/local/searxng
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/worker-py ./apps/worker-py
COPY --from=builder /app/docker ./docker
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/pg_migrations ./pg_migrations
COPY --from=builder /app/packages/core/src ./packages/core/src
COPY --from=builder /app/.env.example ./.env.example

RUN pip3 install --break-system-packages --no-cache-dir -r /app/apps/worker-py/requirements.txt
RUN cp /app/docker/nginx.conf /etc/nginx/nginx.conf \
  && chmod +x /app/docker/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV RESEARCH_SOURCE_SEARCH_ENDPOINT=http://127.0.0.1:8080
ENV RESEARCH_SOURCE_SEARCH_ENGINES=bing
ENV SEARXNG_SETTINGS_PATH=/app/docker/searxng/settings.yml
ENV SEARXNG_BASE_URL=http://127.0.0.1:8080/
ENV SEARXNG_PORT=8080
ENV SEARXNG_BIND_ADDRESS=127.0.0.1
ENV SEARXNG_LIMITER=false
ENV SEARXNG_VALKEY_URL=valkey://127.0.0.1:6379/0
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["/app/docker/entrypoint.sh"]
