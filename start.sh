#!/usr/bin/env bash
# Build and start JobGenie. Images are built one at a time: building them all in parallel can
# exhaust Docker Desktop's memory on smaller machines.
#   bash start.sh            build everything, then start
#   bash start.sh --no-build start with the images already built
set -uo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env found. Copy .env.example to .env and set INTERNAL_AUTH_SECRET."
  exit 1
fi

echo "==> Starting postgres, redis, eureka"
docker compose up -d postgres redis eureka-server || exit 1

if [ "${1:-}" != "--no-build" ]; then
  for svc in user-service job-service resume-service notification-service ai-service api-gateway frontend; do
    echo "==> Building $svc"
    docker compose build "$svc" || { echo "Build failed: $svc"; exit 1; }
  done
fi

echo "==> Starting all services"
docker compose up -d || exit 1

echo "==> Waiting for the gateway and AI service (services can take a few minutes on first start)"
for i in $(seq 1 90); do
  if curl -fs http://localhost:8080/actuator/health >/dev/null 2>&1 && curl -fs http://localhost:8000/health >/dev/null 2>&1; then
    echo "Ready."
    break
  fi
  sleep 10
done
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo
echo "Open http://localhost:3000"
