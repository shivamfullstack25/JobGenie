# Build and start JobGenie (Windows). Images are built one at a time: building them all in
# parallel can exhaust Docker Desktop's memory on smaller machines.
#   .\start.ps1            build everything, then start
#   .\start.ps1 -NoBuild   start with the images already built
param([switch]$NoBuild)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
  Write-Host "No .env found. Copy .env.example to .env and set INTERNAL_AUTH_SECRET." -ForegroundColor Red
  exit 1
}

Write-Host "==> Starting postgres, redis, eureka" -ForegroundColor Cyan
docker compose up -d postgres redis eureka-server
if ($LASTEXITCODE -ne 0) { throw "Failed to start infrastructure" }

if (-not $NoBuild) {
  foreach ($svc in "user-service", "job-service", "resume-service", "notification-service", "ai-service", "api-gateway", "frontend") {
    Write-Host "==> Building $svc" -ForegroundColor Cyan
    docker compose build $svc
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $svc" }
  }
}

Write-Host "==> Starting all services" -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Failed to start services" }

Write-Host "==> Waiting for the gateway and AI service (services can take a few minutes on first start)" -ForegroundColor Cyan
for ($i = 1; $i -le 90; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing http://localhost:8080/actuator/health -TimeoutSec 5 | Out-Null
    Invoke-WebRequest -UseBasicParsing http://localhost:8000/health -TimeoutSec 5 | Out-Null
    Write-Host "Ready." -ForegroundColor Green
    break
  } catch {
    Start-Sleep -Seconds 10
  }
}
docker compose ps
Write-Host ""
Write-Host "Open http://localhost:3000"
