# SUROS

**S**erver **U**ptime & **R**esource **O**bservability **S**ystem — a self-hosted homelab dashboard for monitoring sites, system metrics, drives, and network health from a single interface.

![Dark Mode](https://img.shields.io/badge/theme-dark%20%7C%20light-1a1816?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI-c84b2f?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-2fa87e?style=flat-square)
![Self-Hosted](https://img.shields.io/badge/self--hosted-yes-2f6fc8?style=flat-square)

---

## Overview

SUROS is a lightweight, opinionated monitoring dashboard built for homelabs and self-hosted infrastructure. It polls your services, reads system telemetry, queries drive SMART data, and surfaces everything in a clean bento-grid UI — with outage alerting via email or ntfy push notifications.

No cloud dependency. No telemetry. Runs entirely on your own hardware.

---

## Features

### System Monitoring
- **CPU** — live utilisation gauge, per-core heatmap bars, temperature, CPU pressure graph, core/thread count
- **RAM** — usage percentage with sparkline history
- **GPU** — utilisation, VRAM usage, temperature (NVIDIA via `nvidia-smi`)
- **Storage** — aggregate disk usage across all mounted volumes
- **Network** — real-time RX/TX throughput with live graph and rolling 24-hour transfer totals

### Site Monitoring
- Add any HTTP/HTTPS endpoint and poll it every minute
- Per-site status: Online / LAN / Slow / Offline
- Latency tracking with 20-point history dot strip
- Outage counter per site
- Average latency + response time chart across all sites

### Drive Health
- SMART status (PASSED / FAILED) via `smartmontools`
- Temperature, capacity, powered-on hours
- Per-drive storage usage bar
- Custom friendly name aliases

### Alerting
- **Email** — Gmail App Password, Outlook, Apple iCloud, or Resend API
- **ntfy** — push to any self-hosted or public ntfy server with optional auth token
- Editable templates for host outage/recovery and site outage/recovery alerts
- Site outage notifications are deduplicated across restarts with a three-hour cooldown and reset after recovery
- Test connection button built into the settings drawer

### Logging
- Status checks are appended to one persistent `backend/logs/status.log` file for outage statistics
- Application diagnostics are written to `backend/logs/app.log`
- Recent application logs can be viewed and cleared from the Logging settings section

### UX
- Dark / light theme toggle, persisted to localStorage
- Slide-out settings drawer with tabbed sidebar
- Staggered bento-grid card entry animations
- Pulse ring on online status dots
- Fully responsive down to mobile

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Chart.js, Recharts, Lucide Icons, Tailwind-adjacent CSS vars |
| Backend | Python, FastAPI, SQLAlchemy, psutil, smartmontools |
| Fonts | Syne, Lora, DM Mono (Google Fonts) |
| Deployment | Served via Nginx reverse proxy or `vite preview` |

---

## Screenshots

> _Add your own screenshots here — drop PNGs into `/docs/screenshots/` and reference them below._

```
docs/
  screenshots/
    dashboard-dark.png
    dashboard-light.png
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- `smartmontools` installed on the host (`sudo apt install smartmontools`)
- `nvidia-smi` available if you want GPU metrics (optional)

### 1. Clone

```bash
git clone https://github.com/yourusername/suros.git
cd suros
```

### 2. Quick Setup (Recommended)

Run this single script to set up everything automatically:

```bash
sudo bash /root/setup-suros.sh
```

This script will:
- ✅ Install systemd internet monitoring service for host-level outage tracking
- ✅ Configure custom ports (backend: 7689, frontend: 8755 by default)
- ✅ Build and start Docker containers
- ✅ Verify all services are running

**Expected duration:** 2-3 minutes

### 3. Manual Setup (If Preferred)

If you prefer to set things up step-by-step:

#### Step 1: Start Suros

```bash
cd /root/Suros
docker-compose up -d --build
```

#### Step 2: Setup Systemd Monitoring (One-Time Only)

```bash
bash /root/setup-suros-monitor.sh
```

#### Step 3: Verify Everything

```bash
# Check if monitoring service is running
sudo systemctl status suros-internet-monitor

# View outage logs
sudo journalctl -u suros-internet-monitor -f

# Access dashboard
http://localhost:8755
```

### 7. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

### 8. Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server proxies `/api` requests to `localhost:8000` by default. Update `vite.config.js` if your backend runs on a different port.

### 9. Production Build

```bash
cd frontend
npm run build
# Serve the dist/ folder via Nginx or any static host
```

Example Nginx config:

```nginx
server {
    listen 80;
    server_name suros.local;

    root /var/www/suros/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Configuration

All settings are managed through the in-app Settings drawer (⚙ icon in the header). No config files to edit manually.

| Setting | Description |
|---|---|
| Email Provider | Gmail / Outlook / iCloud / Resend |
| SMTP Credentials | Username, app password, server, port |
| Recipient | Where outage alerts are sent |
| ntfy URL | Your ntfy server (default: `https://ntfy.sh`) |
| ntfy Topic | The topic to publish to |
| ntfy Token | Optional Bearer token for private topics |

Settings are persisted to the backend database and survive restarts.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sites` | All monitored sites with status + history |
| `POST` | `/api/sites` | Add a new site |
| `PUT` | `/api/sites/:id` | Update a site |
| `DELETE` | `/api/sites/:id` | Remove a site |
| `GET` | `/api/stats` | Aggregate uptime, latency, outage counts |
| `GET` | `/api/system-metrics` | Live CPU, RAM, GPU, disk, network rates |
| `GET` | `/api/system-history` | Historical system metrics for sparklines |
| `GET` | `/api/drives` | Drive list with SMART data |
| `POST` | `/api/drives/alias` | Set a friendly name for a drive |
| `GET` | `/api/processes` | Top processes by CPU/memory |
| `GET` | `/api/settings` | Fetch current alert settings |
| `PUT` | `/api/settings` | Update alert settings |
| `POST` | `/api/settings/test-notification` | Send a test alert |
| `GET` | `/api/logs` | Read recent application log entries |
| `DELETE` | `/api/logs/application` | Clear application logs only |
| `GET` | `/health` | Backend health check |

---

## Project Structure

```
suros/
├── backend/
│   ├── server.py            # FastAPI app + all routes
│   ├── requirements.txt
│   ├── uptime.db            # SQLite database (auto-created, ignored)
│   └── logs/                # Status and application logs (ignored)
├── frontend/
│   ├── public/
│   │   ├── suros-logo-dark.png
│   │   └── suros-logo-light.png
│   ├── src/
│   │   ├── App.jsx          # Main dashboard component
│   │   └── Dashboard.css    # All styles + CSS variable theming
│   ├── index.html
│   └── vite.config.js
└── README.md
```

---

## Theming

SUROS uses CSS custom properties for all colours. Both dark and light themes are defined on `:root[data-theme]` and toggled via a data attribute on `<html>`. To customise, edit the variables at the top of `Dashboard.css`:

```css
:root[data-theme="dark"] {
  --bg: #0f0e0d;
  --accent: #c84b2f;   /* primary accent (red-orange) */
  --up: #2fa87e;       /* online / healthy (green) */
  --down: #c84b2f;     /* offline / error (red) */
  --degraded: #e08c2f; /* slow / warning (orange) */
  /* ... */
}
```

---

## Roadmap

- [ ] Historical uptime percentage per site
- [ ] Ping/traceroute panel
- [ ] Public status page mode

---

## License

MIT — do whatever you want with it.

---

<div align="center">
  <sub>Built for Homelabs. Runs on the metal.</sub>
</div>