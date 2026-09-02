#!/bin/bash

# Suros Backend Startup Script
# Initializes logging and provides setup instructions

set -e

echo "🚀 Suros Backend Starting..."

# Initialize outage log file
init_outage_log() {
    LOG_DIR="${LOG_DIR:-/app/logs}"
    OUTAGE_LOG="${OUTAGE_LOG_FILE:-$LOG_DIR/suros-outages.log}"
    
    mkdir -p "$(dirname "$OUTAGE_LOG")"
    
    if [[ ! -f "$OUTAGE_LOG" ]]; then
        touch "$OUTAGE_LOG"
        echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] | INFO | Outage log initialized by Suros backend" >> "$OUTAGE_LOG"
        echo "✓ Created outage log: $OUTAGE_LOG"
    else
        echo "✓ Outage log exists: $OUTAGE_LOG"
    fi
}

# Initialize
init_outage_log

echo "✅ Startup initialization complete"
echo "🚀 Starting Suros backend..."
echo ""

# Start the main application
exec uvicorn server:app --host 0.0.0.0 --port 8000
