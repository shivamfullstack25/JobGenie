# Lean JobGenie bring-up for Windows
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> Starting infrastructure (postgres, redis, eureka)..." -ForegroundColor Cyan
docker compose up -d postgres redis eureka-server
if ($LASTEXITCODE -ne 0) { throw "Failed to start infrastructure" }

Write-Host "==> Waiting for postgres..." -ForegroundColor Cyan
for ($i = 1; $i -le 60; $i++) {
  docker compose exec -T postgres pg_isready -U jobgenie_user 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "postgres ready" -ForegroundColor Green
    break
  }
  Start-Sleep -Seconds 2
}

Write-Host "==> Building & starting backend services..." -ForegroundColor Cyan
docker compose up -d --build user-service job-service resume-service notification-service ai-service
if ($LASTEXITCODE -ne 0) { Write-Host "Backend start had errors — continuing" -ForegroundColor Yellow }

Write-Host "==> Building & starting gateway + frontend..." -ForegroundColor Cyan
docker compose up -d --build api-gateway frontend

Write-Host ""
Write-Host "==> Status:" -ForegroundColor Cyan
docker compose ps
Write-Host ""
Write-Host "Frontend:    http://localhost:3000"
Write-Host "API Gateway: http://localhost:8080"
Write-Host "AI docs:     http://localhost:8000/docs"
Write-Host "Eureka:      http://localhost:8761"
