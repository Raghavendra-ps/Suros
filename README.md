<div align="center">

# SUROS

**Server Uptime & Resource Observability System**

A self-hosted dashboard for monitoring websites, system resources, drives and internet outages on your own hardware.

![License](https://img.shields.io/badge/license-MIT-blue)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)
![Frontend](https://img.shields.io/badge/frontend-React-61dafb?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/deploy-Docker-2496ed?logo=docker&logoColor=white)

</div>

## Features

- Website uptime and latency checks with per-site history
- Live CPU, RAM, GPU, disk and network metrics with sparklines
- Drive list with SMART data and custom drive names
- Top processes by CPU and memory
- Host-level internet outage tracking via a systemd service
- Outage alerts by email (Gmail, Outlook, iCloud, Resend) and [ntfy](https://ntfy.sh)
- Dark and light themes

## Contents

- [Quick start](#quick-start)
- [Manual setup](#manual-setup)
- [Configuration](#configuration)
- [Development](#development)
- [Production build](#production-build)
- [API](#api)
- [Project structure](#project-structure)
- [Theming](#theming)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

## Quick start

From inside the cloned repository:

```bash
sudo bash setup-suros.sh
```

The script takes about 2-3 minutes and will:

1. Install the systemd internet monitor
2. Ask for ports (defaults: backend `7689`, frontend `8755`)
3. Build and start the Docker containers
4. Check that everything is running

Then open <http://localhost:8755>.

> [!NOTE]
> The setup script needs `sudo` to install the systemd service. If you would rather not run it, use the manual steps below.

## Manual setup

```bash
# 1. Start the containers
docker compose up -d --build

# 2. Install the internet monitor (once)
bash setup-suros-monitor.sh

# 3. Verify
sudo systemctl status suros-internet-monitor
sudo journalctl -u suros-internet-monitor -f
```

To run without Docker, you need Python 3.10+ (with `psutil` and `smartmontools`), Node.js 18+, and systemd for the monitor service. See [Development](#development).

## Configuration

Everything is set from the Settings drawer (gear icon in the header). There are no config files to edit. Settings are stored in the backend database and survive restarts.

| Setting | Description |
|---|---|
| Email provider | Gmail, Outlook, iCloud or Resend |
| SMTP credentials | Username, app password, server, port |
| Recipient | Address that receives outage alerts |
| ntfy URL | Your ntfy server (default `https://ntfy.sh`) |
| ntfy topic | Topic to publish to |
| ntfy token | Optional bearer token for private topics |

## Development

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

The dev server proxies `/api` to `localhost:8000`.

> [!NOTE]
> Port `8000` is for local development only. The Docker setup uses the ports you choose during setup (`7689` / `8755` by default).

## Production build

```bash
cd frontend
npm run build
```

Serve `frontend/dist` with Nginx or any static host and proxy `/api` to the backend.

<details>
<summary>Example Nginx config</summary>

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

</details>

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Backend health check |
| `GET` | `/api/sites` | Monitored sites with status and history |
| `POST` | `/api/sites` | Add a site |
| `PUT` | `/api/sites/{id}` | Update a site |
| `DELETE` | `/api/sites/{id}` | Remove a site |
| `POST` | `/api/sites/{id}/check` | Run a check immediately |
| `GET` | `/api/stats` | Aggregate uptime, latency and outage counts |
| `GET` | `/api/system-metrics` | Live CPU, RAM, GPU, disk and network rates |
| `GET` | `/api/system-history` | Historical metrics for sparklines |
| `GET` | `/api/drives` | Drives with SMART data |
| `POST` | `/api/drives/alias` | Set a friendly drive name |
| `GET` | `/api/processes` | Top processes by CPU and memory |
| `GET` | `/api/settings` | Read alert settings |
| `PUT` | `/api/settings` | Update alert settings |
| `POST` | `/api/settings/test-notification` | Send a test alert |
| `GET` | `/api/logs` | List log files |
| `GET` | `/api/logs/{type}` | Read a specific log file |
| `DELETE` | `/api/logs/application` | Clear application logs |
| `DELETE` | `/api/logs/all` | Clear all logs |

## Project structure

```text
suros/
├── backend/
│   ├── server.py            # FastAPI app and routes
│   ├── requirements.txt
│   ├── uptime.db            # SQLite database (auto-created, gitignored)
│   └── logs/                # Status and application logs (gitignored)
├── frontend/
│   ├── public/              # Logos
│   ├── src/
│   │   ├── App.jsx          # Dashboard component
│   │   └── Dashboard.css    # Styles and theme variables
│   ├── index.html
│   └── vite.config.js
├── docker-compose.yml
├── setup-suros.sh           # Automated setup
├── setup-suros-monitor.sh   # Systemd internet monitor setup
└── README.md
```

## Theming

All colours are CSS custom properties, set per theme on `:root[data-theme]` and toggled through a data attribute on `<html>`. Edit the variables at the top of `frontend/src/Dashboard.css`:

```css
:root[data-theme="dark"] {
  --bg: #0f0e0d;
  --accent: #c84b2f;    /* primary accent */
  --up: #2fa87e;        /* online */
  --down: #c84b2f;      /* offline */
  --degraded: #e08c2f;  /* slow */
}
```

## Troubleshooting

<details>
<summary>Backend won't start</summary>

```bash
docker compose logs backend
```

</details>

<details>
<summary>Frontend shows 502</summary>

Check that the backend is up, then restart:

```bash
curl -s http://localhost:7689/health
docker compose restart
```

</details>

<details>
<summary>Systemd monitor not running</summary>

```bash
sudo systemctl status suros-internet-monitor
sudo systemctl restart suros-internet-monitor
```

</details>

<details>
<summary>Port already in use</summary>

```bash
sudo lsof -i :7689
```

Re-run `sudo bash setup-suros.sh` and pick different ports.

</details>

**Log files** (in `backend/logs/`)

| File | Contents |
|---|---|
| `suros-outages.log` | Outage events, written by both Suros and the systemd service |
| `app.log` | Application log |
| `status.log` | Status check history |

## Roadmap

- [ ] Historical uptime percentage per site
- [ ] Ping/traceroute panel
- [ ] Public status page mode

## License

[MIT](LICENSE)
