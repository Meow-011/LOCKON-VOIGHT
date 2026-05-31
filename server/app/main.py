"""
LOCKON VOIGHT — The Core
Central Collector & API Server
"""

import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api import competitions, contestants, incidents, auth, health, telemetry, policy, settings as app_settings
from app.services.screen_broadcast import router as screen_router
from app.ws.endpoints import router as ws_router
from app.core.config import settings
from fastapi.staticfiles import StaticFiles
import os

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info(f"[VOIGHT Core] Starting v{settings.APP_VERSION}...")
    logger.info(f"[VOIGHT Core] Environment: {settings.ENVIRONMENT}")

    # Start gRPC server in background (if not in test mode)
    grpc_task = None
    if settings.ENVIRONMENT != "test":
        try:
            from app.grpc.server import serve_grpc
            grpc_task = asyncio.create_task(serve_grpc())
            logger.info(f"[VOIGHT Core] gRPC server starting on port {settings.GRPC_PORT}")
        except Exception as e:
            logger.warning(f"[VOIGHT Core] Could not start gRPC server: {e}")

    logger.info("[VOIGHT Core] ═══════════════════════════════════════")
    logger.info("[VOIGHT Core]   LOCKON VOIGHT — Integrity Protocol")
    logger.info("[VOIGHT Core]   Ghost Hunting Mode: ACTIVE")
    logger.info("[VOIGHT Core] ═══════════════════════════════════════")

    try:
        yield
    finally:
        # Shutdown
        if grpc_task:
            grpc_task.cancel()
            try:
                await grpc_task
            except asyncio.CancelledError:
                pass
        logger.info("[VOIGHT Core] Shutting down...")


app = FastAPI(
    title="LOCKON VOIGHT — Integrity Protocol",
    description=(
        "AI Detection & Proctoring System API.\n\n"
        "Provides real-time monitoring of contestant machines during "
        "CTF competitions, certification exams, and skill assessments.\n\n"
        "**Key Features:**\n"
        "- 🕵️ AI Process Detection\n"
        "- 🌐 Network Intelligence\n"
        "- 📊 Resource Anomaly Detection\n"
        "- 🔒 Integrity Scoring\n"
        "- 📡 Real-time WebSocket Updates"
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if "*" not in settings.CORS_ORIGINS else ["*"],
    allow_credentials=True if "*" not in settings.CORS_ORIGINS else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files for agent resources (e.g., Logo.png)
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "static"))
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

os.makedirs("uploads/banners", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ──────────────────────────────────────────────
# Register API Routers
# ──────────────────────────────────────────────

# Infrastructure
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(app_settings.router, prefix="/api/settings", tags=["Settings"])

# Authentication
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])

# Management (Proctor Dashboard)
app.include_router(competitions.router, prefix="/api/competitions", tags=["Competitions"])
app.include_router(contestants.router, prefix="/api/contestants", tags=["Contestants"])
app.include_router(incidents.router, prefix="/api/incidents", tags=["Incidents"])
app.include_router(policy.router, prefix="/api/policy", tags=["Policy"])

# Telemetry Ingestion (Agent → Server)
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["Telemetry"])

# WebSocket (Server → Dashboard)
app.include_router(ws_router, tags=["WebSocket"])

# Screen Broadcasting (Agent → Server → Dashboard)
app.include_router(screen_router, prefix="/api/screen", tags=["Screen Broadcast"])
