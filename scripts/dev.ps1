#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Starting infrastructure..."
docker compose up -d postgres redis piped-db piped-bg-helper piped-backend piped-proxy

Write-Host "Waiting for services to be healthy..."
# Wait for postgres
do {
  Start-Sleep 1
} until (docker compose exec -T postgres pg_isready -U postgres -d music 2>$null)

# Wait for redis
do {
  Start-Sleep 1
} until (docker compose exec -T redis redis-cli ping 2>$null)

# Wait for Piped backend readiness
$maxWait = 180
$elapsed = 0
while ($true) {
  try {
    $res = Invoke-WebRequest -Uri "http://localhost:7081/config" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($res.StatusCode -eq 200) {
      Write-Host "Piped ready"
      break
    }
  } catch {}
  if ($elapsed -ge $maxWait) {
    Write-Host "Piped not ready after $maxWait seconds, proceeding"
    break
  }
  Start-Sleep 2
  $elapsed += 2
}

Write-Host "Running migrations..."
npm run db:migrate

Write-Host "Starting development servers..."
npm run dev