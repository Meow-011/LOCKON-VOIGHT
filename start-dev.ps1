<#
.SYNOPSIS
LOCKON VOIGHT - Quick Start Script

.DESCRIPTION
This script automates the startup process for local development.
It starts the database containers, runs migrations, and launches the API and Dashboard.
#>

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " LOCKON VOIGHT - Development Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Compile and Package Agents
Write-Host "[1/5] Compiling and Packaging Agents..." -ForegroundColor Yellow
.\rebuild.ps1

# 2. Start Infrastructure (Docker)
Write-Host "[2/5] Starting Database & Redis (Docker)..." -ForegroundColor Yellow
cd deploy
docker compose -f docker-compose.yml up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to start Docker containers. Is Docker running?" -ForegroundColor Red
    exit 1
}
cd ..

# 3. Wait for Postgres to be ready (simple delay)
Write-Host "[3/5] Waiting for Database to initialize (this may take longer on first boot)..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# 4. Database Migrations
Write-Host "[4/5] Running Database Migrations..." -ForegroundColor Yellow
cd server
# Try to use virtual environment if it exists
if (Test-Path "venv\Scripts\python.exe") {
    .\venv\Scripts\python.exe -m alembic upgrade head
} else {
    python -m alembic upgrade head
}
cd ..

# 5. Launch Services
Write-Host "[5/5] Launching API Server and Dashboard..." -ForegroundColor Yellow
Write-Host "-> API Server will open in a new window" -ForegroundColor Green
Write-Host "-> Dashboard will open in a new window" -ForegroundColor Green

Start-Process powershell -ArgumentList "-NoExit", "-Command", "& { cd server; if (Test-Path 'venv\Scripts\uvicorn.exe') { .\venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --reload --port 8000 } else { uvicorn app.main:app --host 0.0.0.0 --reload --port 8000 } }"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& { cd dashboard; npm run dev -- --host 0.0.0.0 }"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " SYSTEM ONLINE" -ForegroundColor Green
Write-Host " API Server:  http://localhost:8000"
Write-Host " Dashboard:   http://localhost:5173"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "NOTE: To stop the database later, run 'docker compose down' in the deploy folder." -ForegroundColor Gray

Write-Host ""
Write-Host "Opening Dashboard in your web browser..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"
