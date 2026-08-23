#!/usr/bin/env bash
# Lean JobGenie bring-up: infra first, then services (avoids one giant blocked build)
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Starting infrastructure (postgres, redis, eureka)..."
docker compose up -d postgres redis eureka-server

echo "==> Waiting for postgres healthy..."
for i in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U jobgenie_user >/dev/null 2>&1; then
    echo "postgres ready"
    break
  fi
  sleep 2
done

echo "==> Building & starting backend services..."
docker compose up -d --build user-service job-service resume-service notification-service ai-service

echo "==> Building & starting gateway + frontend..."
docker compose up -d --build api-gateway frontend

echo "==> Status:"
docker compose ps
echo ""
echo "Frontend:    http://localhost:3000"
echo "API Gateway: http://localhost:8080"
echo "AI docs:     http://localhost:8000/docs"
echo "Eureka:      http://localhost:8761"
