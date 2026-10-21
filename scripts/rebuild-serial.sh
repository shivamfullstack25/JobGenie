#!/usr/bin/env bash
# Build and start the stack one service at a time. Building everything in parallel has crashed
# Docker Desktop on low-memory machines. Usage: bash scripts/rebuild-serial.sh
set -uo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_PARALLEL_LIMIT=1
step() { echo "==> $*"; }
step "infra"; docker compose up -d postgres redis eureka-server || exit 1
for svc in user-service job-service resume-service notification-service ai-service api-gateway frontend; do
  step "build $svc"; docker compose build "$svc" || { echo "BUILD FAILED: $svc"; exit 1; }
done
step "up"; docker compose up -d || exit 1
step "waiting for health"
for i in $(seq 1 60); do
  if curl -fs http://localhost:8080/actuator/health >/dev/null 2>&1 && curl -fs http://localhost:8000/health >/dev/null 2>&1; then echo "gateway and AI service healthy"; break; fi
  sleep 10
done
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
