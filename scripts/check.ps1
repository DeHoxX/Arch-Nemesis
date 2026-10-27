# scripts/check.ps1
# Verification script for Arch-Nemesis Phase 1

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $PSScriptRoot

Write-Host "=== 1. Checking Backend (apps/api) ===" -ForegroundColor Cyan
Push-Location "$rootDir\apps\api"
try {
    Write-Host "-> Ruff check..." -ForegroundColor Yellow
    uv run ruff check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "-> Ruff format check..." -ForegroundColor Yellow
    uv run ruff format --check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "-> Mypy type check..." -ForegroundColor Yellow
    uv run mypy src tests
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "-> Import linter..." -ForegroundColor Yellow
    uv run lint-imports
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "-> Pytest..." -ForegroundColor Yellow
    uv run pytest -q
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

Write-Host "`n=== 2. Checking Frontend (apps/web) ===" -ForegroundColor Cyan
Push-Location "$rootDir\apps\web"
try {
    Write-Host "-> ESLint..." -ForegroundColor Yellow
    npm run lint
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "-> TypeScript compiler check..." -ForegroundColor Yellow
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "-> Vitest tests..." -ForegroundColor Yellow
    npm test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

Write-Host "`nAll verification checks passed!" -ForegroundColor Green

