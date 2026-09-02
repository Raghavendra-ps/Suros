#!/bin/bash

# Suros Backend Startup Script
# Initializes logging and provides setup instructions

set -e

echo "🚀 Suros Backend Starting..."

# Function to log setup instructions
log_setup_instructions() {
    cat << 'EOF'

────────────────────────────────────────────────────────────
📋 FIRST-TIME SETUP REQUIRED: Internet Outage Monitoring
────────────────────────────────────────────────────────────

To enable automatic outage monitoring, run this once on the host:

  bash /root/setup-suros-monitor.sh

This will install a systemd service that monitors internet connectivity
independently, even when the Suros container is down.

────────────────────────────────────────────────────────────

EOF
}

# Initialize outage log file
init_outage_log() {
    OUTAGE_LOG="/root/suros-outages.log"
    
    if [[ ! -f "$OUTAGE_LOG" ]]; then
        touch "$OUTAGE_LOG"
        echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] | INFO | Outage log initialized by Suros backend" >> "$OUTAGE_LOG"
        echo "✓ Created outage log: $OUTAGE_LOG"
        
        # Show setup instructions on first run
        log_setup_instructions
    else
        echo "✓ Outage log exists: $OUTAGE_LOG"
    fi
}

# Check if systemd monitor is installed
check_systemd_monitor() {
    if systemctl list-unit-files suros-internet-monitor.service &>/dev/null 2>&1; then
        if systemctl is-enabled suros-internet-monitor &>/dev/null 2>&1; then
            echo "✓ Systemd internet monitor is installed and enabled"
            return 0
        fi
    fi
    return 1
}

# Initialize
init_outage_log

# Check if setup is needed
if ! check_systemd_monitor 2>/dev/null; then
    echo ""
    echo "⚠️  Systemd internet monitor not yet installed"
    echo "   Run this on the host to enable it:"
    echo "   bash /root/setup-suros-monitor.sh"
    echo ""
fi

echo "✅ Startup initialization complete"
echo "🚀 Starting Suros backend..."
echo ""

# Start the main application
exec uvicorn server:app --host 0.0.0.0 --port 8000
