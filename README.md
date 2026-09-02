# SUROS - Server Uptime & Resource Observability System

## 🚀 Quick Setup (Recommended)

Run this single command from inside the cloned repository to configure everything automatically:

```bash
sudo bash setup-suros.sh
```

**Expected duration:** 2-3 minutes

This script will:
- ✅ Install systemd internet monitoring service for host-level outage tracking
- ✅ Configure custom ports (backend: 7689, frontend: 8755 by default)
- ✅ Build and start Docker containers
- ✅ Verify all services are running

---

## 📋 Manual Setup (If Preferred)

### Step 1: Start Suros

```bash
docker compose up -d --build
```

### Step 2: Setup Systemd Monitoring (One-Time Only)

```bash
bash setup-suros-monitor.sh
```

### Step 3: Verify Everything

```bash
# Check if monitoring service is running
sudo systemctl status suros-internet-monitor

# View outage logs
sudo journalctl -u suros-internet-monitor -f

# Access dashboard
http://localhost:8755
```

---

## 📁 Repository Structure

| File | Purpose |
|------|---------|
| `setup-suros.sh` | Main automated setup script (TUI with progress bars) |
| `setup-suros-monitor.sh` | Systemd internet monitoring script |
| `README.md` | Main project documentation |
| `docker-compose.yml` | Docker Compose orchestration |
| `backend/` | FastAPI backend |
| `frontend/` | React frontend |

---

## 🛠️ Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

---

## 🎨 Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server proxies `/api` requests to `localhost:8000` by default.

---

## 📦 Production Build

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

    location / {
        root /path/to/Suros/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | System health summary |
| `GET` | `/api/sites` | Monitored websites list |
| `POST` | `/api/sites` | Add a website |
| `PUT` | `/api/sites/{id}` | Update a website |
| `DELETE` | `/api/sites/{id}` | Remove a website |
| `POST` | `/api/sites/{id}/check` | Trigger immediate check |
| `GET` | `/api/system` | CPU, RAM, disk usage |
| `GET` | `/api/logs` | Suros log file list |
| `GET` | `/api/logs/{type}` | Get specific log file |
| `DELETE` | `/api/logs/all` | Clear all log files |
| `DELETE` | `/api/logs/application` | Clear application logs only |
| `GET` | `/health` | Backend health check |

---

## 🌐 Deployment Options

### Option 1: Docker (Recommended)

```bash
sudo bash setup-suros.sh
```

### Option 2: Manual Docker

```bash
docker compose up -d --build
```

### Option 3: Native (Bare Metal)

Install dependencies directly:
- Python 3.10+ with psutil, smartmontools
- Node.js 18+ with React, Tailwind
- Systemd for the internet monitor service

---

## 🔧 Troubleshooting

### Common Issues

**Backend won't start?**
```bash
docker compose logs backend
```

**Frontend shows 502?**
```bash
# Check if backend is running
curl -s http://localhost:7689/api/settings | head -5

# Restart containers
docker compose restart
```

**Systemd service not running?**
```bash
sudo systemctl status suros-internet-monitor
sudo systemctl restart suros-internet-monitor
```

**Port already in use?**
```bash
# Check what's using the port
sudo lsof -i :7689

# Choose different ports via setup script
sudo bash setup-suros.sh
```

### Log Files

- `backend/logs/suros-outages.log` - Outage events (written by both Suros and systemd)
- `backend/logs/app.log` - Application logs
- `backend/logs/status.log` - Status check history

---

## 📄 License

MIT — do whatever you want with it.

---

<div align="center">
  <sub>Built for Homelabs. Runs on the metal.</sub>
</div>

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