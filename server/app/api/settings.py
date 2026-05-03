from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
import os
import uuid

from app.core.security import get_current_user

router = APIRouter()

# ─── File Upload Constraints ─────────────────────────────────
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
SETTINGS_FILE = "settings.json"

class SettingsModel(BaseModel):
    sensitivity: int
    autoBan: bool
    webhook: str
    competitionKey: str
    scanInterval: int = 5
    dashboardBannerUrl: Optional[str] = None

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    return {
        "sensitivity": 70,
        "autoBan": False,
        "webhook": "https://discord.com/api/webhooks/...",
        "competitionKey": "GLOBAL_COMP_KEY_12345",
        "scanInterval": 5,
        "dashboardBannerUrl": None
    }

@router.get("/public")
async def get_public_settings():
    """Public endpoint — returns ONLY non-sensitive settings (e.g., competition key for agent config).
    This is used by the Agent Download page which does NOT require authentication."""
    settings = load_settings()
    return {
        "competitionKey": settings.get("competitionKey", ""),
    }

@router.get("/")
async def get_settings(current_user: dict = Depends(get_current_user)):
    return load_settings()

@router.post("/")
async def save_settings(settings: SettingsModel, current_user: dict = Depends(get_current_user)):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings.model_dump(), f)
    return {"status": "success"}

@router.post("/upload-banner")
async def upload_dashboard_banner(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload a custom dashboard banner."""
    # Validate file extension
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    
    # Read and validate file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
    
    os.makedirs("uploads/banners", exist_ok=True)
    filename = f"dashboard_{uuid.uuid4()}.{ext}"
    filepath = os.path.join("uploads", "banners", filename)
    
    # Load existing settings to check for old banner
    current_settings = load_settings()
    old_url = current_settings.get("dashboardBannerUrl")
    
    # Save new file
    with open(filepath, "wb") as f:
        f.write(content)
        
    url = f"/uploads/banners/{filename}"
    
    # Delete old banner if it exists
    if old_url:
        old_path = old_url.lstrip("/")
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception:
                pass
    
    # Save URL to settings
    current_settings["dashboardBannerUrl"] = url
    with open(SETTINGS_FILE, "w") as f:
        json.dump(current_settings, f)
        
    return {"url": url}

@router.delete("/banner")
async def delete_dashboard_banner(current_user: dict = Depends(get_current_user)):
    """Remove the dashboard banner."""
    current_settings = load_settings()
    old_url = current_settings.get("dashboardBannerUrl")
    
    # Delete old banner if it exists
    if old_url:
        old_path = old_url.lstrip("/")
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception:
                pass
                
    current_settings["dashboardBannerUrl"] = None
    with open(SETTINGS_FILE, "w") as f:
        json.dump(current_settings, f)
    return {"status": "success"}

