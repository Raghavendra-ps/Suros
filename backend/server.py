import asyncio
import time
import requests
import psutil
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import models
from database import SessionLocal, engine, get_db
from pydantic import BaseModel
from typing import List, Optional

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Odyssey Uptime Monitor API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Schemas ---
class SiteBase(BaseModel):
    name: str
    url: str
    icon: Optional[str] = "🌐"

class SiteCreate(SiteBase):
    pass

class HistorySchema(BaseModel):
    timestamp: datetime
    status: str
    latency: Optional[float]

    class Config:
        from_attributes = True

class SiteSchema(SiteBase):
    id: int
    status: str
    latency: Optional[float]
    last_checked: Optional[datetime]
    history: List[HistorySchema] = []

    class Config:
        from_attributes = True

import subprocess

# --- Monitoring Logic ---
def check_site_status(url: str):
    t0 = time.time()
    try:
        # 5 second timeout
        response = requests.get(url, timeout=5)
        latency = (time.time() - t0) * 1000 # to ms
        if response.status_code < 400:
            return "success", latency
        else:
            return "down" if latency > 2000 else "slow", latency
    except Exception:
        return "down", None

def get_gpu_metrics():
    try:
        # Querying NVIDIA GPU utilization and memory
        cmd = ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"]
        output = subprocess.check_output(cmd, encoding='utf-8').strip()
        if output:
            lines = output.split('\n')
            results = []
            for line in lines:
                parts = [p.strip() for p in line.split(',')]
                if len(parts) == 3:
                    results.append({
                        "util": int(parts[0]),
                        "memory": {
                            "used": round(int(parts[1]) / 1024, 1), # to GB
                            "total": round(int(parts[2]) / 1024, 1) # to GB
                        }
                    })
            return results[0] if results else None
    except Exception:
        return None
    return None

# --- Global Metrics Tracking ---
last_net_sent = psutil.net_io_counters().bytes_sent
last_net_time = time.time()
net_out_rate = 0 # Mbps

async def monitor_sites_task():
    global net_out_rate, last_net_sent, last_net_time
    while True:
        # Update Network Metrics
        now = time.time()
        curr_sent = psutil.net_io_counters().bytes_sent
        elapsed = now - last_net_time
        if elapsed > 0:
            # (bytes / seconds) * 8 bits / 1,000,000 = Mbps
            net_out_rate = round(((curr_sent - last_net_sent) / elapsed) * 8 / 1_000_000, 2)
            last_net_sent = curr_sent
            last_net_time = now

        db = SessionLocal()
        try:
            sites = db.query(models.Site).all()
            for site in sites:
                status, latency = check_site_status(site.url)
                site.status = status
                site.latency = latency
                site.last_checked = datetime.utcnow()
                
                # Add history entry
                history_entry = models.History(
                    site_id=site.id,
                    status=status,
                    latency=latency
                )
                db.add(history_entry)
                
                # Keep only last 100 history entries per site
                history_count = db.query(models.History).filter(models.History.site_id == site.id).count()
                if history_count > 100:
                    oldest = db.query(models.History).filter(models.History.site_id == site.id).order_by(models.History.timestamp.asc()).first()
                    db.delete(oldest)
                
            db.commit()
        except Exception as e:
            print(f"Monitor task error: {e}")
        finally:
            db.close()
        
        # Check every 60 seconds
        await asyncio.sleep(60)

async def daily_export_task():
    import json
    import os
    while True:
        now = datetime.now()
        # Export at 3 AM
        if now.hour == 3 and now.minute == 0:
            db = SessionLocal()
            try:
                sites = db.query(models.Site).all()
                export_data = []
                for site in sites:
                    history = db.query(models.History).filter(models.History.site_id == site.id).all()
                    export_data.append({
                        "site": site.name,
                        "url": site.url,
                        "history": [
                            {"t": h.timestamp.isoformat(), "s": h.status, "l": h.latency} 
                            for h in history
                        ]
                    })
                
                os.makedirs("exports", exist_ok=True)
                filename = f"exports/history_{now.strftime('%Y-%m-%d')}.json"
                with open(filename, "w") as f:
                    json.dump(export_data, f, indent=2)
                print(f"Daily export saved: {filename}")
            except Exception as e:
                print(f"Export error: {e}")
            finally:
                db.close()
            # Wait a minute so we don't trigger twice
            await asyncio.sleep(65)
        
        await asyncio.sleep(30)

@app.on_event("startup")
async def startup_event():
    # ... previous seeding code ...
    db = SessionLocal()
    if db.query(models.Site).count() == 0:
        default_sites = [
            {"name": "Suros", "url": "http://localhost:3001", "icon": "🖥️"},
            {"name": "Containers", "url": "http://localhost:5001", "icon": "📦"},
            {"name": "Torrent", "url": "http://localhost:1340", "icon": "📥"},
            {"name": "Dashboard", "url": "http://localhost:8092", "icon": "📊"},
            {"name": "Ads", "url": "http://localhost:8083", "icon": "📢"},
            {"name": "Drives", "url": "http://localhost:8097", "icon": "💾"},
            {"name": "WWW", "url": "http://localhost:8089", "icon": "🌐"},
            {"name": "Home", "url": "http://localhost:8089", "icon": "🏠"},
            {"name": "Punch", "url": "http://localhost:9999", "icon": "⏰"},
            {"name": "OpenClaw", "url": "http://localhost:18789", "icon": "🦞"},
            {"name": "AI-1", "url": "http://localhost:11434", "icon": "🤖"},
            {"name": "AI-2", "url": "http://localhost:11435", "icon": "🧠"},
        ]
        for s in default_sites:
            db.add(models.Site(**s))
        db.commit()
    db.close()
    
    # Start tasks
    asyncio.create_task(monitor_sites_task())
    asyncio.create_task(daily_export_task())

# --- API Endpoints ---

@app.get("/api/sites", response_model=List[SiteSchema])
def get_sites(db: Session = Depends(get_db)):
    sites = db.query(models.Site).all()
    # Sort history by timestamp
    for site in sites:
        site.history = sorted(site.history, key=lambda x: x.timestamp)
    return sites

@app.post("/api/sites", response_model=SiteSchema)
def add_site(site: SiteCreate, db: Session = Depends(get_db)):
    db_site = models.Site(**site.dict())
    db.add(db_site)
    db.commit()
    db.refresh(db_site)
    return db_site

@app.put("/api/sites/{site_id}", response_model=SiteSchema)
def update_site(site_id: int, site_update: SiteCreate, db: Session = Depends(get_db)):
    db_site = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    for key, value in site_update.dict().items():
        setattr(db_site, key, value)
    
    db.commit()
    db.refresh(db_site)
    return db_site

@app.delete("/api/sites/{site_id}")
def delete_site(site_id: int, db: Session = Depends(get_db)):
    site = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    db.delete(site)
    db.commit()
    return {"message": "Site deleted"}

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    sites = db.query(models.Site).all()
    up = len([s for s in sites if s.status == "success"])
    down = len([s for s in sites if s.status == "down" or s.status == "pending"])
    
    latencies = [s.latency for s in sites if s.latency is not None]
    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    
    # Uptime percentage calculation (last 100 checks)
    total_checks = db.query(models.History).count()
    up_checks = db.query(models.History).filter(models.History.status == "success").count()
    overall_uptime = (up_checks / total_checks * 100) if total_checks > 0 else 0
    
    return {
        "up": up,
        "down": down,
        "avg_latency": round(avg_latency),
        "overall_uptime": round(overall_uptime)
    }

@app.get("/api/system-metrics")
def get_system_metrics():
    # Get system metrics - use interval=1 for more stable readings
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    gpu = get_gpu_metrics()
    
    return {
        "cpu": cpu_percent,
        "memory": {
            "percent": memory.percent,
            "used": round(memory.used / (1024 ** 3), 2),
            "total": round(memory.total / (1024 ** 3), 2)
        },
        "disk": {
            "percent": disk.percent,
            "used": round(disk.used / (1024 ** 3), 2),
            "total": round(disk.total / (1024 ** 3), 2)
        },
        "net_out": net_out_rate,
        "gpu": gpu,
        "uptime": round(time.time() - psutil.boot_time(), 0)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
