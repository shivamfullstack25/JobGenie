# JobGenie Windows startup script
# Usage: .\docker-start.ps1           # build and start all services
#        .\docker-start.ps1 -Status  # show service status
#        .\docker-start.ps1 -Stop    # stop all services
#        .\docker-start.ps1 -Logs    # tail recent logs

param(
    [switch]$Status,
    [switch]$Stop,
    [switch]$Logs,
    [switch]$InstallDocker
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Test-DockerReady {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        return $false
    }
    try {
        docker info *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Install-DockerDesktop {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Err "winget is not available. Install Docker Desktop manually:"
        Write-Host "https://docs.docker.com/desktop/setup/install/windows-install/"
        exit 1
    }

    Write-Info "Installing Docker Desktop (admin approval may be required)..."
    winget install Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    Write-Warn "Docker Desktop installed. Start Docker Desktop from the Start menu, wait until it is running, then re-run:"
    Write-Host "  .\docker-start.ps1"
    exit 0
}

function Ensure-EnvFile {
    if (Test-Path ".env") {
        Write-Info ".env already exists"
        return
    }

    if (Test-Path "env.example") {
        Copy-Item "env.example" ".env"
        Write-Ok "Created .env from env.example"
    } else {
        Write-Err "No .env or env.example found"
        exit 1
    }

    Write-Warn "Update OPENAI_API_KEY in .env before using AI features"
}

function Get-ComposeCommand {
    if (docker compose version 2>$null) {
        return @("docker", "compose")
    }
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        return @("docker-compose")
    }
    Write-Err "Docker Compose is not available"
    exit 1
}

function Show-Status {
    $compose = Get-ComposeCommand
    & $compose[0] $compose[1..($compose.Length - 1)] ps
    Write-Host ""
    Write-Info "URLs:"
    Write-Host "  Frontend:     http://localhost:3000"
    Write-Host "  API Gateway:  http://localhost:8080"
    Write-Host "  AI Service:   http://localhost:8000/docs"
    Write-Host "  Eureka:       http://localhost:8761"
}

function Wait-ForHttp($name, $url, $maxAttempts = 60) {
    Write-Info "Waiting for $name..."
    for ($i = 1; $i -le $maxAttempts; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
                Write-Ok "$name is ready"
                return
            }
        } catch {
            Start-Sleep -Seconds 5
        }
    }
    Write-Warn "$name did not become ready in time"
}

if ($InstallDocker) {
    Install-DockerDesktop
}

if (-not (Test-DockerReady)) {
    Write-Err "Docker is not installed or not running."
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  1. Run: .\docker-start.ps1 -InstallDocker"
    Write-Host "  2. Install Docker Desktop manually and start it"
    exit 1
}

$compose = Get-ComposeCommand

if ($Stop) {
    Write-Info "Stopping JobGenie services..."
    & $compose[0] $compose[1..($compose.Length - 1)] down
    Write-Ok "Services stopped"
    exit 0
}

if ($Logs) {
    & $compose[0] $compose[1..($compose.Length - 1)] logs --tail=50
    exit 0
}

if ($Status) {
    Show-Status
    exit 0
}

Write-Host "JobGenie Docker Startup" -ForegroundColor Green
Write-Host "======================="

Ensure-EnvFile

# Disable Kafka when no broker is defined in compose
$envContent = Get-Content ".env" -Raw
if ($envContent -match "KAFKA_ENABLED=true" -and -not (Select-String -Path "docker-compose.yml" -Pattern "kafka:" -Quiet)) {
    Write-Warn "KAFKA_ENABLED=true but no Kafka service in docker-compose.yml; setting KAFKA_ENABLED=false"
    (Get-Content ".env") -replace "^KAFKA_ENABLED=true", "KAFKA_ENABLED=false" | Set-Content ".env"
}

Write-Info "Building images (first run may take 15-30 minutes)..."
& $compose[0] $compose[1..($compose.Length - 1)] build
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker build failed"
    exit $LASTEXITCODE
}

Write-Info "Starting services..."
& $compose[0] $compose[1..($compose.Length - 1)] up -d
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker compose up failed"
    exit $LASTEXITCODE
}

Wait-ForHttp "API Gateway" "http://localhost:8080/actuator/health"
Wait-ForHttp "Frontend" "http://localhost:3000"
Wait-ForHttp "AI Service" "http://localhost:8000/health"

Show-Status
Write-Ok "JobGenie is starting. Open http://localhost:3000 in your browser."
Write-Info "View logs: .\docker-start.ps1 -Logs"
Write-Info "Stop:      .\docker-start.ps1 -Stop"
