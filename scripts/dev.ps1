#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Starting infrastructure..."
docker compose up -d postgres redis

Write-Host "Waiting for services to be healthy..."
# Wait for postgres
do {
  Start-Sleep 1
} until (docker compose exec -T postgres pg_isready -U postgres -d music 2>$null)

# Wait for redis
do {
  Start-Sleep 1
} until (docker compose exec -T redis redis-cli ping 2>$null)

Write-Host "Running migrations..."
npm run db:migrate

Write-Host "Starting development servers..."
npm run dev