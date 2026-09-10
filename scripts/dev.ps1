#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# The Piped stack is the expensive part of the dev infra (~1 GB of images and a
# second Postgres), so it dies with this script instead of lingering after the
# dev servers are gone. `stop` rather than `down`: the containers keep their
# state, and `restart: unless-stopped` honours a manual stop, so they stay down
# across a reboot too. Postgres/Redis are left running on purpose - they are
# cheap and hold the BullMQ queue.
$PipedServices = @('piped-backend', 'piped-proxy', 'piped-bg-helper', 'piped-db')

try {
  Write-Host "Starting infrastructure..."
  docker compose up -d postgres redis @PipedServices

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
}
finally {
  # Runs on normal exit, on an error, and on Ctrl+C.
  Write-Host ""
  Write-Host "Stopping Piped stack..."
  docker compose stop @PipedServices *> $null
}
