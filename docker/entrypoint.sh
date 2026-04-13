#!/bin/sh
set -e

node /app/docker/runtime-db-init.mjs

exec /usr/bin/supervisord -c /app/docker/supervisord.conf
