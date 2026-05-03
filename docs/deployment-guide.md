# LOCKON VOIGHT — Deployment Guide

## Prerequisites

- Docker Engine ≥ 24.0
- Docker Compose ≥ 2.20
- Go ≥ 1.22 (for agent builds)
- Node.js ≥ 20 (for dashboard dev)
- Python ≥ 3.12 (for server dev)

---

## Quick Start (Development)

> **Recommended:** Use the automated startup script — it handles Docker, migrations, compilation, and launching all services in a single command.

### Automated (PowerShell)
```powershell
# From the project root, run as Administrator:
.\start-dev.ps1
```
This script will:
1. Start Docker containers (PostgreSQL + Redis)
2. Run database migrations (`alembic upgrade head`)
3. Cross-compile the Go Agent for Windows, Linux, and macOS
4. Start the FastAPI server and React dashboard
5. Open your browser to `http://localhost:5173`

### Manual (Step-by-Step)

#### 1. Start Infrastructure
```powershell
cd deploy
docker compose -f docker-compose.yml up -d
```
This starts PostgreSQL (TimescaleDB) and Redis.

#### 2. Start API Server
```powershell
cd server
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### 3. Start Dashboard
```powershell
cd dashboard
npm install
npm run dev
```
Open http://localhost:5173

### Initial Setup (First Run)
Visit **http://localhost:5173** in your browser. 
Since no admin users exist, the system will automatically redirect you to the **INITIAL SETUP** page. 
Enter your desired Username and Password to create the primary administrator account.

---

## Production Deployment

### 1. Configure Environment
```powershell
cd deploy
copy .env.example .env
```

Edit `.env` with strong passwords:
```ini
DB_PASSWORD=<generate: python -c "import secrets; print(secrets.token_urlsafe(32))">
REDIS_PASSWORD=<generate: python -c "import secrets; print(secrets.token_urlsafe(32))">
JWT_SECRET_KEY=<generate: python -c "import secrets; print(secrets.token_urlsafe(64))">
DOMAIN=voight.yourdomain.com
```

> ⚠️ **Security:** The server will **refuse to start** in production mode if `JWT_SECRET_KEY` is still set to the default value.

### 2. Deploy with Docker Compose
```powershell
cd deploy
docker compose -f docker-compose.prod.yml up -d --build
```

### 3. Run Database Migrations
```powershell
docker exec voight-api alembic upgrade head
```

### 4. Verify Deployment
```powershell
# Check all services
docker compose -f docker-compose.prod.yml ps

# Check API health
curl http://localhost:8000/api/health

# Check dashboard
curl -s http://localhost:80/ | Select-Object -First 1
```

The production stack includes:
- **Nginx** reverse proxy (port 80) with security headers and gzip
- **FastAPI** API server (4 Uvicorn workers)
- **Celery Worker** + **Celery Beat** for background tasks
- **PostgreSQL + TimescaleDB** with resource limits
- **Redis** with password authentication

All services run with health checks and automatic restarts. The API server runs as a non-root user (`voight`) inside the container.

---

## Agent Distribution

### Global Self-Enrollment (Recommended)
The simplest method — contestants download and self-enroll:

1. Navigate to `http://<YOUR_SERVER_IP>:5173/download`
2. Select the platform (Windows / Linux / macOS)
3. Click **DOWNLOAD BUNDLE** — the ZIP includes the pre-configured `config.json` with the server's `competition_key` and IP address
4. Extract, edit `config.json` to set `team_name` and `handle`, and run with Administrator/root privileges

The agent will automatically enroll using the format `KEY::TEAM::HANDLE` against the active competition.

### Build Agent Binaries (For Developers)

**Automated:**
```powershell
.\rebuild.ps1
```

**Manual (per-platform):**
```powershell
cd agent

# Windows
$env:GOOS="windows"; $env:GOARCH="amd64"
go build -ldflags="-s -w" -o bin/voight-sentinel.exe ./cmd/voight

# Linux
$env:GOOS="linux"; $env:GOARCH="amd64"
go build -ldflags="-s -w" -o bin/voight-sentinel ./cmd/voight

# macOS (Intel)
$env:GOOS="darwin"; $env:GOARCH="amd64"
go build -ldflags="-s -w" -o bin/voight-sentinel-darwin ./cmd/voight
```

### Customizing the Agent Icon (Windows)
```powershell
go install github.com/tc-hib/go-winres@latest
```
Replace `agent/winres/icon.png` (must be 256x256), then:
```powershell
cd agent
go-winres make
Move-Item -Force rsrc_windows_amd64.syso cmd/voight/
# Now rebuild the Windows binary
```

---

## Configuration Reference

### Server Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | `development` / `production` |
| `DEBUG` | `true` | Enable debug mode |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | — | Redis connection string |
| `JWT_SECRET_KEY` | — | **Required** for token signing |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access token TTL |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token TTL |
| `GRPC_PORT` | `50052` | gRPC server port |
| `GRPC_MAX_WORKERS` | `10` | gRPC thread pool size |
| `CORS_ORIGINS` | `["*"]` | Allowed CORS origins |
| `SCORE_THRESHOLD_GREEN` | `30` | GREEN → YELLOW boundary |
| `SCORE_THRESHOLD_YELLOW` | `70` | YELLOW → RED boundary |
| `SCORE_DECAY_RECENT_MINUTES` | `5` | Full-weight window |
| `SCORE_DECAY_MEDIUM_MINUTES` | `15` | Medium decay window |
| `SCORE_DECAY_OLD_MINUTES` | `30` | Old decay window |
| `DATA_RETENTION_DAYS` | `90` | Auto-delete data older than |
| `AGENT_HEARTBEAT_TIMEOUT_SECONDS` | `30` | Heartbeat timeout |

### Agent Configuration (`config.json`)

| Field | Default | Description |
|---|---|---|
| `server_address` | — | Server IP or hostname |
| `grpc_port` | `50052` | gRPC port |
| `enrollment_token` | — | Auto-generated or `KEY::TEAM::HANDLE` |
| `team_name` | — | Team name for self-enrollment |
| `handle` | — | Contestant handle |
| `scan_interval_seconds` | `10` | Process/network scan frequency (overridden by server) |
| `heartbeat_interval_seconds` | `5` | Heartbeat frequency (overridden by server) |

---

## Troubleshooting

### Agent won't connect
1. Verify server address and gRPC port (`50052`) are correct in `config.json`
2. Check firewall allows outbound TCP on port `50052`
3. Verify the `competition_key` matches the server's configured key
4. Check agent logs for `[VOIGHT]` prefix messages

### Dashboard shows no data
1. Check API server is running: `curl localhost:8000/api/health`
2. Verify WebSocket connection in browser DevTools (Network → WS)
3. Ensure competition is set to **Active** status
4. Confirm at least one agent has successfully enrolled

### High memory usage
1. Check `DATA_RETENTION_DAYS` — reduce for shorter retention
2. Increase PostgreSQL `shared_buffers` for large competitions
3. Monitor Celery worker memory with `docker stats`

### Scoring seems wrong
1. Check time decay — indicators older than 30 min decay to 10% weight
2. Review incident status — `DISMISSED` incidents are excluded from scoring
3. Verify dynamic policy rules in **Settings → Detection Policy**

### Policy returns 403 Forbidden
The agent may log: `Failed to update policy: status 403`.  
This is expected — policy updates via REST API require authentication. The agent will receive the latest policy via **gRPC heartbeat** as a fallback. No action is required.

---

*Last updated: 2026-05-03*
