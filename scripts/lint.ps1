#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

npm run lint
npm run typecheck