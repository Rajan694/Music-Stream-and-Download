#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js not found. Please install Node.js >= 20"
  exit 1
}

$nodeVersion = node -e "console.log(process.versions.node.split('.')[0])"
if ([int]$nodeVersion -lt 20) {
  Write-Error "Node.js >= 20 required (found v$nodeVersion)"
  exit 1
}

Write-Host "Installing dependencies..."
npm install --no-engine-strict

Write-Host "Generating Prisma client..."
npm run db:generate

Write-Host "Building shared and db packages..."
npm run build -w packages/shared
npm run build -w packages/db

if (-not (Test-Path .env)) {
  Write-Host "Copying .env.example to .env..."
  Copy-Item .env.example .env
}

Write-Host "Setup complete. Run 'npm run dev' to start development."