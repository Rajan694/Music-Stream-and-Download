#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if ($args.Count -eq 0) {
  Write-Host "Usage: $0 {up|down|logs|rebuild}"
  exit 1
}

switch ($args[0]) {
  'up' {
    docker compose --profile prod up -d
  }
  'down' {
    docker compose --profile prod down
  }
  'logs' {
    docker compose --profile prod logs -f
  }
  'rebuild' {
    docker compose --profile prod build --no-cache
    docker compose --profile prod up -d
  }
  default {
    Write-Host "Usage: $0 {up|down|logs|rebuild}"
    exit 1
  }
}