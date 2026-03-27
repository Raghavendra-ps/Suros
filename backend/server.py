import asyncio
import time
import requests
import psutil
import subprocess
import logging
import os
import json
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import models
from database import SessionLocal, engine, get_db
from pydantic import BaseModel
from typing import List, Optional

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("odyssey-backend")

# Create database tables
try:
    models.Base.metadata.create_all(bind=engine)
except Exception as e:
    logger.error(f"Database creation error: {e}")

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
    external_status: Optional[str] = None
    history: List[HistorySchema] = []

    class Config:
        from_attributes = True

import subprocess

# --- Monitoring Logic ---
def check_site_status(url: str):
    t0 = time.time()
    try:
        from urllib.parse import urlparse
        import re
        domain = urlparse(url).netloc.split(':')[0]
        is_ip = re.match(r'^(\d{1,3}\.){3}\d{1,3}$', domain)
        is_local_ip = is_ip or domain in ['localhost', '127.0.0.1']

        if is_local_ip:
            # LAN Check (IPs)
            response = requests.get(url, timeout=5)
            latency = (time.time() - t0) * 1000
            if response.status_code < 400:
                # IPs are always "LAN UP" (Yellow)
                return "lan_up", latency
            return "down", latency
        else:
            # WAN Check (Domains)
            try:
                # Primary: WAN check via isitup.org
                ext_res = requests.get(f"https://isitup.org/{domain}.json", timeout=3)
                if ext_res.status_code == 200:
                    data = ext_res.json()
                    if data.get('status_code') == 1:
                        # Success on WAN (Green)
                        try:
                            l_res = requests.get(url, timeout=2)
                            latency = (time.time() - t0) * 1000
                        except:
                            latency = None
                        return "success", latency
                    elif data.get('status_code') == 2:
                        # WAN Down, check LAN fallback
                        response = requests.get(url, timeout=5)
                        if response.status_code < 400:
                            return "lan_up", (time.time() - t0) * 1000
                        return "down", None
            except:
                pass
            
            # Final Fallback
            response = requests.get(url, timeout=5)
            latency = (time.time() - t0) * 1000
            if response.status_code < 400:
                return "lan_up" if latency < 2000 else "slow", latency
            return "down", latency
            
    except Exception:
        return "down", None

def get_gpu_metrics():
    try:
        # Querying NVIDIA GPU utilization, memory, and temperature
        cmd = ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"]
        output = subprocess.check_output(cmd, encoding='utf-8').strip()
        if output:
            lines = output.split('\n')
            results = []
            for line in lines:
                parts = [p.strip() for p in line.split(',')]
                if len(parts) == 4:
                    results.append({
                        "util": int(parts[0]),
                        "memory": {
                            "used": round(int(parts[1]) / 1024, 2),
                            "total": round(int(parts[2]) / 1024, 2)
                        },
                        "temp": int(parts[3])
                    })
            return results[0] if results else None
    except Exception:
        return None
    return None

def get_cpu_temp():
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return None
        
        # Look for common CPU temp keys (coretemp, k10temp, etc.)
        for name, entries in temps.items():
            if name in ['coretemp', 'cpu_thermal', 'k10temp']:
                return entries[0].current
        
        # Fallback to the first available sensor
        return list(temps.values())[0][0].current
    except Exception:
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
            # Update Site Metrics
            sites = db.query(models.Site).all()
            for site in sites:
                status, latency = check_site_status(site.url)
                site.status = status
                site.latency = latency
                site.last_checked = datetime.utcnow()
                
                # Add site history entry
                history_entry = models.History(
                    site_id=site.id,
                    status=status,
                    latency=latency
                )
                db.add(history_entry)
                
                # Keep last 2880 checks (24 hours at 30s intervals)
                history_count = db.query(models.History).filter(models.History.site_id == site.id).count()
                if history_count > 2880:
                    oldest = db.query(models.History).filter(models.History.site_id == site.id).order_by(models.History.timestamp.asc()).first()
                    db.delete(oldest)

            # Update System History
            gpu_metrics = get_gpu_metrics()
            sys_history = models.SystemHistory(
                cpu=psutil.cpu_percent(),
                ram=psutil.virtual_memory().percent,
                disk=psutil.disk_usage('/').percent,
                gpu=gpu_metrics['util'] if gpu_metrics else None
            )
            db.add(sys_history)
            
            # Keep last 2880 system snapshots (24 hours at 30s intervals)
            sys_count = db.query(models.SystemHistory).count()
            if sys_count > 2880:
                oldest_sys = db.query(models.SystemHistory).order_by(models.SystemHistory.timestamp.asc()).first()
                db.delete(oldest_sys)
                
            db.commit()
        except Exception as e:
            print(f"Monitor task error: {e}")
        finally:
            db.close()
        
        # Check every 30 seconds for live updates
        await asyncio.sleep(30)

async def daily_export_task():
    import json
    import os
    while True:
        now = datetime.now()
        # Export at 3 AM once per day
        if now.hour == 3 and now.minute == 0:
            logger.info("Starting daily history export...")
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
    logger.info("Backend starting up...")
    try:
        db = SessionLocal()
        if db.query(models.Site).count() == 0:
            logger.info("Seeding default sites...")
            default_sites = [
                {"name": "Suros", "url": "http://localhost:3001", "icon": "Monitor"},
                {"name": "Containers", "url": "http://localhost:5001", "icon": "Box"},
                {"name": "Torrent", "url": "http://localhost:1340", "icon": "HardDrive"},
                {"name": "Dashboard", "url": "http://localhost:8092", "icon": "Layers"},
                {"name": "Ads", "url": "http://localhost:8083", "icon": "Globe"},
                {"name": "Drives", "url": "http://localhost:8097", "icon": "HardDrive"},
                {"name": "WWW", "url": "http://localhost:8089", "icon": "Globe"},
                {"name": "Home", "url": "http://localhost:8089", "icon": "Server"},
                {"name": "Punch", "url": "http://localhost:9999", "icon": "Activity"},
                {"name": "OpenClaw", "url": "http://localhost:18789", "icon": "Terminal"},
                {"name": "AI-1", "url": "http://localhost:11434", "icon": "Cpu"},
                {"name": "AI-2", "url": "http://localhost:11435", "icon": "Cpu"},
            ]
            for s in default_sites:
                db.add(models.Site(**s))
            db.commit()
            logger.info(f"Seeded {len(default_sites)} sites.")
        db.close()
        
        # Start tasks
        asyncio.create_task(monitor_sites_task())
        asyncio.create_task(daily_export_task())
        logger.info("Background tasks started.")
    except Exception as e:
        logger.error(f"Startup error: {e}")

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
    
    # Total Outages in last 24 hours (Count of distinct downtime events)
    yesterday = datetime.now() - timedelta(hours=24)
    total_outages = 0
    for site in sites:
        site_history = db.query(models.History).filter(
            models.History.site_id == site.id,
            models.History.timestamp >= yesterday
        ).order_by(models.History.timestamp.asc()).all()
        
        last_inner_status = "success"
        for h in site_history:
            if h.status == "down" and last_inner_status != "down":
                total_outages += 1
            last_inner_status = h.status

    # Network Health (Ping 1.1.1.1)
    network_latency = None
    try:
        import socket
        start = time.time()
        socket.create_connection(("1.1.1.1", 53), timeout=2)
        network_latency = round((time.time() - start) * 1000)
    except:
        network_latency = None

    # Uptime percentage calculation (last 2880 checks)
    total_checks = db.query(models.History).filter(models.History.timestamp >= yesterday).count()
    up_checks = db.query(models.History).filter(
        models.History.status == "success",
        models.History.timestamp >= yesterday
    ).count()
    overall_uptime = (up_checks / total_checks * 100) if total_checks > 0 else 0
    
    return {
        "up": up,
        "down": down,
        "avg_latency": round(avg_latency),
        "overall_uptime": round(overall_uptime),
        "total_outages": total_outages,
        "network_latency": network_latency
    }

@app.get("/api/system-history")
def get_system_history(db: Session = Depends(get_db)):
    history = db.query(models.SystemHistory).order_by(models.SystemHistory.timestamp.asc()).all()
    return history

@app.get("/api/system-metrics")
def get_system_metrics():
    try:
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
            "gpu": gpu,
            "temp": {
                "cpu": get_cpu_temp(),
                "gpu": gpu['temp'] if gpu else None
            },
            "uptime": round(time.time() - psutil.boot_time(), 0)
        }
    except Exception as e:
        logger.error(f"Error fetching system metrics: {e}")
        return {
            "cpu": 0, "memory": {"percent": 0, "used": 0, "total": 0},
            "disk": {"percent": 0, "used": 0, "total": 0},
            "gpu": None, "uptime": 0
        }

@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting uvicorn directly...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")
