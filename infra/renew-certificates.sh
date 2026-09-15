#!/bin/sh
set -eu

cd "$(dirname "$0")"
docker compose \
  --env-file ../backend/.env \
  --env-file ../frontend/.env \
  -f docker-compose.yml \
  run --rm certbot renew \
  --webroot \
  --webroot-path=/var/www/certbot \
  --quiet
docker compose \
  --env-file ../backend/.env \
  --env-file ../frontend/.env \
  -f docker-compose.yml \
  exec -T nginx nginx -s reload
