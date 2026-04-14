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

RUN apk add --no-cache libc6-compat python3 py3-pip make g++
WORKDIR /app
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

RUN apk add --no-cache nginx supervisor python3 py3-pip libc6-compat
WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /tmp/runtime-node_modules ./node_modules
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/worker-py ./apps/worker-py
COPY --from=builder /app/docker ./docker
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/pg_migrations ./pg_migrations
COPY --from=builder /app/.env.example ./.env.example

RUN pip3 install --break-system-packages --no-cache-dir -r /app/apps/worker-py/requirements.txt
RUN chmod +x /app/docker/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["/app/docker/entrypoint.sh"]
