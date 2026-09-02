# 🚀 Suros First-Time Setup Guide

## Complete Automated Setup (Recommended)

Run this single command to configure everything:

```bash
sudo bash /root/setup-suros.sh
```

This **comprehensive setup script** will:

### ✓ Phase 1: Systemd Internet Monitoring
- Install systemd service for host-level internet monitoring
- Create monitoring script at `/root/suros-internet-monitor.sh`
- Enable automatic startup on system boot
- Start the service immediately

### ✓ Phase 2: Port Configuration  
- Prompt you for custom backend API port (default: 7689)
- Prompt you for custom frontend web port (default: 8755)
- Validate port numbers (must be 1024-65535 and not in use)

### ✓ Phase 3: Docker Compose Deployment
- Pull latest images
- Build Docker containers with your custom port settings
- Start all services (backend + frontend)
- Wait for services to stabilize

### ✓ Phase 4: System Verification
- Verify all services are running
- Display systemd service status
- Show access URLs with your configured ports

---

## What Happens During Setup

The setup script provides a beautiful **Terminal User Interface (TUI)** that:
- Shows progress bars for each major step
- Validates prerequisites (Docker, Docker Compose, systemd)
- Uses color-coded output for easy reading
- Asks for port configurations interactively
- Provides helpful command references at the end

**Expected duration:** 2-3 minutes

---

## Manual Setup (If Preferred)

If you prefer to set things up step-by-step:

### Step 1: Start Suros Manually

```bash
cd /root/Suros
docker-compose up -d --build
```

### Step 2: Setup Systemd Monitoring (One-Time Only)

```bash
bash /root/setup-suros-monitor.sh
```

### Step 3: Verify Everything is Working

**Check if the monitoring service is running:**
```bash
sudo systemctl status suros-internet-monitor
```

**View real-time outage logs:**
```bash
sudo journalctl -u suros-internet-monitor -f
```

**Check the outage log file:**
```bash
cat /root/suros-outages.log
```

**Access the dashboard:**
Open your browser to: `http://localhost:8755` (or custom port if configured)

---

## Setup Script Features

### 🎨 Beautiful Terminal UI
The setup script provides visual feedback throughout the process:
- **ASCII Art Logo** - Suros branding at startup
- **Color-Coded Messages**:
  - 🟢 Green `[✓]` for successful steps
  - 🔴 Red `[✗]` for errors
  - 🔵 Blue `[i]` for informational messages
  - 🟡 Yellow `[!]` for warnings
  - 🟣 Magenta `[?]` for user input prompts
- **Progress Bars** - Visual indication of setup progress
- **Structured Sections** - Organized output with clear sections

### 🔧 Interactive Port Configuration
During setup, you'll be prompted:
```
? Backend API port (default: 7689): █
```

You can:
- Press Enter to use the default port
- Type a custom port number (must be 1024-65535)
- The script validates your input and asks again if invalid

### ✅ Pre-Flight Checks
Before proceeding, the script verifies:
- Running with `sudo` (required for systemd)
- Docker is installed
- Docker Compose is available
- Suros directory exists at `/root/Suros`
- Systemd is available

If any check fails, setup stops with a clear error message.

### 📊 Real-Time Status
At the end of setup, you get:
- Current systemd service status
- Exact URLs to access your dashboard
- Useful command references
- Next steps to get started

---

## What Gets Installed

The setup script creates/modifies these files:

| File | Purpose |
|------|---------|
| `/root/suros-internet-monitor.sh` | Monitoring script (executable) |
| `/etc/systemd/system/suros-internet-monitor.service` | Systemd unit file (auto-start enabled) |
| `/root/suros-outages.log` | Shared outage event log |
| `/root/Suros/docker-compose.yml` | Updated with your custom ports |
| `/root/Suros/docker-compose.yml.bak` | Backup of original config |

---

## Architecture

### Before Running Setup Script:
- Only **Suros** container monitors network connectivity
- If container crashes → outages are not logged
- ❌ Cannot detect if host itself lost internet
- ❌ Docker Compose uses default ports

### After Running Setup Script:
- **Suros** container monitors network (inside container perspective)
- **Systemd service** monitors network independently (host perspective)
- Both write to `/root/suros-outages.log`
- Even if Suros crashes, the systemd monitor continues recording
- ✓ Complete outage history including container downtime
- ✓ Custom ports configured and services running
- ✓ Automatic startup on system reboot

## Daily Operations

### View outage history in dashboard:
1. Go to `Logging` tab → `Reset Outage Counter` section
2. Click `Refresh` to see recent outage events

### Reset outage counter:
Use the `Reset Outage Counter` button in the Logging tab to clear all outage history.

### Check service logs:
```bash
# Live logs
sudo journalctl -u suros-internet-monitor -f

# Last 50 entries
sudo journalctl -u suros-internet-monitor -n 50

# Logs from specific time
sudo journalctl -u suros-internet-monitor --since "1 hour ago"
```

### Stop/restart monitoring:
```bash
# Stop
sudo systemctl stop suros-internet-monitor

# Restart
sudo systemctl restart suros-internet-monitor

# Disable (won't start on boot)
sudo systemctl disable suros-internet-monitor
```

## Troubleshooting

### Setup Script Issues

**Error: "This script must be run as root"**
```bash
# Solution: Run with sudo
sudo bash /root/setup-suros.sh
```

**Error: "Docker is not installed"**
```bash
# Solution: Install Docker
# For Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y docker.io
```

**Error: "Docker Compose is not available"**
```bash
# Solution: Install Docker Compose
# For Ubuntu/Debian:
sudo apt-get install -y docker-compose
```

**Error: "Suros directory not found at /root/Suros"**
```bash
# Solution: Clone or restore the Suros directory
# Verify it exists:
ls -la /root/Suros/
```

**Setup hangs during "Building Docker images"**
- This can take 2-5 minutes depending on your internet speed
- Be patient - the script is downloading and building images
- If it hangs for >10 minutes, press Ctrl+C and check:
  ```bash
  docker ps
  docker logs Suros-Backend
  ```

### Port Configuration Issues

**Error: "Invalid port! Must be between 1024 and 65535"**
- Ports below 1024 require root privileges
- Choose a port in the 1024-65535 range
- Common safe ports: 7689 (backend), 8755 (frontend)

**Error: "Port already in use"**
```bash
# Check which process is using the port
sudo lsof -i :PORTNUMBER

# Kill the process or choose a different port
```

### Service Issues

**Service not starting?**
```bash
sudo journalctl -u suros-internet-monitor -n 50
```

**Connection errors in monitor?**
The script checks both `1.1.1.1:53` and `8.8.8.8:53`. If both fail for 3 consecutive checks, it logs an outage.

**Need to reinstall the service?**
```bash
# Remove old service
sudo systemctl stop suros-internet-monitor
sudo systemctl disable suros-internet-monitor
sudo rm /etc/systemd/system/suros-internet-monitor.service
sudo systemctl daemon-reload

# Reinstall
sudo bash /root/setup-suros.sh
```

### Docker Container Issues

**Containers won't start?**
```bash
# Check the logs
cd /root/Suros
docker compose logs -f

# Restart containers
docker compose restart
```

**Port mappings not applied?**
```bash
# Verify docker-compose.yml has correct ports
cat /root/Suros/docker-compose.yml | grep -A 2 "ports:"

# If wrong, restore backup and rerun setup
cp /root/Suros/docker-compose.yml.bak /root/Suros/docker-compose.yml
sudo bash /root/setup-suros.sh
```

## Files Created

During setup, these files are created/modified:

- `/root/suros-internet-monitor.sh` - The monitoring script
- `/etc/systemd/system/suros-internet-monitor.service` - Systemd service file (auto-enabled)
- `/root/suros-outages.log` - Shared outage log (read by Suros, written by both services)
- `/root/Suros/docker-compose.yml` - Updated with your custom port mappings
- `/root/Suros/docker-compose.yml.bak` - Backup of original configuration

---

**Need help?** Check the logs or review the technical documentation at `/root/SUROS_OUTAGE_SETUP.md`
