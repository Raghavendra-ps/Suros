import asyncio
import time
import requests
import psutil
import subprocess
import logging
import os
import json
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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

# Static files for uploads
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

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
    outage_count: int = 0
    history: List[HistorySchema] = []

    class Config:
        from_attributes = True

class SettingsSchema(BaseModel):
    dashboard_name: str
    logo_url: Optional[str] = None

    class Config:
        from_attributes = True

import subprocess

def check_site_status(url: str):
    t0 = time.time()
    try:
        from urllib.parse import urlparse
        import re
        domain = urlparse(url).netloc.split(':')[0]
        is_ip = re.match(r'^(\d{1,3}\.){3}\d{1,3}$', domain)
        is_local_ip = is_ip or domain in ['localhost', '127.0.0.1', '0.0.0.0']

        if is_local_ip:
            # LAN Check (IPs) — reachable locally
            try:
                response = requests.get(url, timeout=5)
                latency = (time.time() - t0) * 1000
                # Any response means reachable (even 4xx/5xx), mark as LAN
                return "lan_up", latency
            except requests.exceptions.ConnectionError:
                # Connection refused - service is running but not accepting connections
                # This should still count as LAN reachable, not down
                return "lan_up", None
            except requests.exceptions.Timeout:
                # Timeout - mark as lan_up since it's a local address
                return "lan_up", None
            except Exception:
                # Other errors - still mark as lan_up for local addresses
                return "lan_up", None
        else:
            # WAN Check (Domains) — public internet check via isitup.org
            try:
                ext_res = requests.get(f"https://isitup.org/{domain}.json", timeout=3)
                if ext_res.status_code == 200:
                    data = ext_res.json()
                    if data.get('status_code') == 1:
                        # Domain is up on public internet
                        try:
                            l_res = requests.get(url, timeout=2)
                            latency = (time.time() - t0) * 1000
                            # If latency < 100ms, treat as local/LAN
                            if latency is not None and latency < 100:
                                return "lan_up", latency
                        except:
                            latency = None
                        return "success", latency
                    elif data.get('status_code') == 2:
                        # Domain is down globally — check local LAN fallback
                        try:
                            response = requests.get(url, timeout=5)
                            if response.status_code < 400:
                                latency = (time.time() - t0) * 1000
                                # If latency < 100ms, treat as local/LAN
                                if latency < 100:
                                    return "lan_up", latency
                                return "lan_up", latency
                        except:
                            pass
                        return "down", None
            except:
                pass

            # Final fallback — direct HTTP check
            response = requests.get(url, timeout=5)
            latency = (time.time() - t0) * 1000
            if response.status_code < 400:
                # If latency < 100ms, treat as local/LAN
                if latency < 100:
                    return "lan_up", latency
                return "success", latency
            return "down", latency

    except Exception:
        return "down", None

def get_gpu_metrics():
    """Query NVIDIA GPU metrics via nvidia-smi. Returns None if unavailable (no proprietary driver)."""
    try:
        # Check if nvidia-smi exists first
        subprocess.check_call(["which", "nvidia-smi"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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

# Server outage tracking
last_network_online = True
current_outage_type = None   # 'network' | 'power'
current_outage_start = None

def is_internet_reachable():
    """Returns True if internet is reachable (ping 1.1.1.1:53), False otherwise."""
    try:
        import socket
        socket.create_connection(("1.1.1.1", 53), timeout=2)
        return True
    except:
        return False

def get_external_latency():
    """Ping 1.1.1.1 and return latency in ms. Returns None if unreachable."""
    try:
        import socket
        start = time.time()
        socket.create_connection(("1.1.1.1", 53), timeout=2)
        return round((time.time() - start) * 1000)
    except:
        return None

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
            global last_network_online, current_outage_type, current_outage_start

            # Check server internet connectivity
            server_online = is_internet_reachable()
            net_lat = get_external_latency()

            # Detect network outage transitions
            if server_online and not last_network_online:
                # Network came back online — close the open outage
                if current_outage_type == 'network' and current_outage_start:
                    open_events = db.query(models.OutageEvent).filter(
                        models.OutageEvent.outage_type == 'network',
                        models.OutageEvent.ended_at.is_(None)
                    ).all()
                    for ev in open_events:
                        ev.ended_at = datetime.utcnow()
                    current_outage_type = None
                    current_outage_start = None

            if not server_online and last_network_online:
                # Network went offline — start a new outage
                new_outage = models.OutageEvent(
                    outage_type='network',
                    started_at=datetime.utcnow(),
                    ended_at=None
                )
                db.add(new_outage)
                current_outage_type = 'network'
                current_outage_start = datetime.utcnow()

            last_network_online = server_online

            # Update Site Metrics
            sites = db.query(models.Site).all()
            for site in sites:
                status, latency = check_site_status(site.url)
                site.status = status
                # Use the latency from the site-specific check, not the shared external ping
                site.latency = latency if latency is not None else net_lat
                site.last_checked = datetime.utcnow()

                # Detect external outages for sites (when status becomes 'down' not 'lan_up')
                # We'll count transitions into 'down' from any other status
                # Check last history entry for this site
                last_h = db.query(models.History).filter(
                    models.History.site_id == site.id
                ).order_by(models.History.timestamp.desc()).first()

                was_down = last_h.status == 'down' if last_h else False
                is_down = status == 'down'

                if is_down and not was_down:
                    # Site went down externally — increment outage count
                    site.outage_count = (site.outage_count or 0) + 1

                # Add site history entry
                history_entry = models.History(
                    site_id=site.id,
                    status=status,
                    latency=latency if latency is not None else net_lat
                )
                db.add(history_entry)

                # Keep last 2880 checks (24 hours at 30s intervals)
                history_count = db.query(models.History).filter(models.History.site_id == site.id).count()
                if history_count > 2880:
                    oldest = db.query(models.History).filter(models.History.site_id == site.id).order_by(models.History.timestamp.asc()).first()
                    db.delete(oldest)

            # Update System History with server connectivity info
            gpu_metrics = get_gpu_metrics()
            sys_history = models.SystemHistory(
                cpu=psutil.cpu_percent(),
                ram=psutil.virtual_memory().percent,
                disk=psutil.disk_usage('/').percent,
                gpu=gpu_metrics['util'] if gpu_metrics else None,
                network_online=1 if server_online else 0
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
        
        # Initialize settings if they don't exist
        if db.query(models.Settings).count() == 0:
            logger.info("Initializing default settings...")
            settings = models.Settings(dashboard_name="Odyssey", logo_url=None)
            db.add(settings)
            db.commit()
            logger.info("Settings initialized.")
        
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

@app.get("/api/site-outages/{site_id}")
def get_site_outages(site_id: int, db: Session = Depends(get_db)):
    """Get external outage count for a specific site."""
    site = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return {"site_id": site_id, "outage_count": site.outage_count}

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    sites = db.query(models.Site).all()
    up = len([s for s in sites if s.status == "success"])
    # Up = success (fully reachable) or lan_up (LAN reachable but WAN down)
    up = len([s for s in sites if s.status == "success" or s.status == "lan_up"])
    # Down = confirmed unreachable OR still pending first check
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

    # Network Outage Count (server internet connectivity lost)
    network_outages = db.query(models.OutageEvent).filter(
        models.OutageEvent.outage_type == 'network'
    ).count()
    power_outages = db.query(models.OutageEvent).filter(
        models.OutageEvent.outage_type == 'power'
    ).count()

    # Current ongoing outage
    current_outage = None
    open_outage = db.query(models.OutageEvent).filter(
        models.OutageEvent.ended_at.is_(None)
    ).first()
    if open_outage:
        current_outage = {
            "type": open_outage.outage_type,
            "started_at": open_outage.started_at.isoformat()
        }

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

    # Server connectivity history (last 50 entries)
    sys_hist = db.query(models.SystemHistory).order_by(models.SystemHistory.timestamp.desc()).limit(50).all()
    connectivity_history = [
        {"t": h.timestamp.isoformat(), "online": h.network_online == 1}
        for h in reversed(sys_hist)
    ]

    return {
        "up": up,
        "down": down,
        "avg_latency": round(avg_latency),
        "overall_uptime": round(overall_uptime),
        "total_outages": total_outages,
        "network_latency": network_latency,
        "network_outages": network_outages,
        "power_outages": power_outages,
        "current_outage": current_outage,
        "connectivity_history": connectivity_history
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
        
        # Get all disk partitions - match lsblk format
        disks = []
        seen_devices = set()
        
        try:
            for partition in psutil.disk_partitions():
                try:
                    # Skip pseudo filesystems and very small partitions
                    if partition.fstype in ('squashfs', 'tmpfs', 'devtmpfs', 'overlay', 'proc', 'sysfs', 'devpts'):
                        continue
                    
                    usage = psutil.disk_usage(partition.mountpoint)
                    if usage.total < 1024 * 1024 * 1024:  # Skip partitions < 1GB
                        continue
                    
                    # Extract device name (e.g., sda2 from /dev/sda2)
                    device_name = partition.device.split('/')[-1] if partition.device else ''
                    
                    # Skip if we've already seen this device
                    if device_name and device_name in seen_devices:
                        continue
                    if device_name:
                        seen_devices.add(device_name)
                    
                    # Skip container-specific paths
                    mountpoint = partition.mountpoint
                    if any(x in mountpoint for x in ['/var/lib/docker', '/etc/resolv.conf', '/etc/hostname', '/etc/hosts', '/proc', '/sys', '/dev']):
                        continue
                    
                    disks.append({
                        "device": device_name,
                        "mountpoint": mountpoint,
                        "fstype": partition.fstype,
                        "total": round(usage.total / (1024 ** 3), 2),
                        "used": round(usage.used / (1024 ** 3), 2),
                        "free": round(usage.free / (1024 ** 3), 2),
                        "percent": usage.percent
                    })
                except (PermissionError, FileNotFoundError, OSError, KeyError):
                    pass
        except Exception:
            pass
        
        # Calculate total storage
        total_storage = sum(d["total"] for d in disks)
        used_storage = sum(d["used"] for d in disks)
        
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
            "disks": disks,
            "total_storage": {
                "total": round(total_storage, 2),
                "used": round(used_storage, 2),
                "free": round(total_storage - used_storage, 2),
                "percent": round((used_storage / total_storage * 100) if total_storage > 0 else 0, 1)
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
            "disks": [],
            "total_storage": {"total": 0, "used": 0, "free": 0, "percent": 0},
            "gpu": None, "uptime": 0
        }

@app.post("/api/upload-logo")
async def upload_logo(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a logo file to the static folder"""
    allowed_types = {"image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: PNG, JPEG, GIF, SVG, WebP")
    
    filename = f"logo{os.path.splitext(file.filename)[1]}"
    filepath = os.path.join(STATIC_DIR, filename)
    
    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)
    
    logo_url = f"/static/{filename}"
    
    # Update settings in database
    settings = db.query(models.Settings).first()
    if not settings:
        settings = models.Settings(dashboard_name="Odyssey", logo_url=logo_url)
        db.add(settings)
    else:
        settings.logo_url = logo_url
    db.commit()
    
    return {"url": logo_url, "filename": filename}

@app.get("/api/logo")
def get_logo():
    """Get the current logo URL"""
    files = os.listdir(STATIC_DIR)
    logo_files = [f for f in files if f.startswith("logo.")]
    if logo_files:
        return {"url": f"/static/{logo_files[0]}"}
    return {"url": None}

@app.get("/api/settings", response_model=SettingsSchema)
def get_settings(db: Session = Depends(get_db)):
    """Get dashboard settings (name and logo)"""
    settings = db.query(models.Settings).first()
    if not settings:
        # Create default settings
        settings = models.Settings(dashboard_name="Odyssey", logo_url=None)
        db.add(settings)
        db.commit()
    return settings

@app.put("/api/settings", response_model=SettingsSchema)
def update_settings(settings_data: SettingsSchema, db: Session = Depends(get_db)):
    """Update dashboard settings (name and logo)"""
    settings = db.query(models.Settings).first()
    if not settings:
        settings = models.Settings(
            dashboard_name=settings_data.dashboard_name,
            logo_url=settings_data.logo_url
        )
        db.add(settings)
    else:
        settings.dashboard_name = settings_data.dashboard_name
        if settings_data.logo_url is not None:
            settings.logo_url = settings_data.logo_url
    db.commit()
    return settings

@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting uvicorn directly...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")
