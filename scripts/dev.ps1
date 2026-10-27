# scripts/dev.ps1
# Starts API and Web dev servers in separate PowerShell processes

$rootDir = Split-Path -Parent $PSScriptRoot

Write-Host "Starting Arch-Nemesis API (FastAPI) on http://127.0.0.1:8000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\apps\api'; uv run uvicorn archnemesis.main:create_app --factory --reload --port 8000"

Write-Host "Starting Arch-Nemesis Web (Next.js) on http://localhost:3000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\apps\web'; npm run dev"

Write-Host "Both services launched in separate windows." -ForegroundColor Green

