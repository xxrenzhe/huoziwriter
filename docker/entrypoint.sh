#!/bin/sh
set -e

export RESEARCH_SOURCE_SEARCH_ENDPOINT="${RESEARCH_SOURCE_SEARCH_ENDPOINT:-http://127.0.0.1:8080}"
export SEARXNG_SETTINGS_PATH="${SEARXNG_SETTINGS_PATH:-/app/docker/searxng/settings.yml}"
export SEARXNG_BASE_URL="${SEARXNG_BASE_URL:-http://127.0.0.1:8080/}"
export SEARXNG_PORT="${SEARXNG_PORT:-8080}"
export SEARXNG_BIND_ADDRESS="${SEARXNG_BIND_ADDRESS:-127.0.0.1}"
export SEARXNG_VALKEY_URL="${SEARXNG_VALKEY_URL:-valkey://127.0.0.1:6379/0}"

if [ -z "${SEARXNG_SECRET:-}" ]; then
  if [ -n "${SEARXNG_SECRET_KEY:-}" ]; then
    export SEARXNG_SECRET="$SEARXNG_SECRET_KEY"
  else
    export SEARXNG_SECRET="$(openssl rand -hex 32)"
  fi
fi

node /app/docker/runtime-db-init.mjs

exec /usr/bin/supervisord -c /app/docker/supervisord.conf
