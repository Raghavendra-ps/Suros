#!/bin/bash

# Suros Systemd Service Auto-Setup
# Run this after first docker-compose up to enable automatic outage monitoring

echo "🔧 Setting up Suros Internet Outage Monitor as Systemd Service"
echo ""

# Check if already installed
if [[ -f /etc/systemd/system/suros-internet-monitor.service ]]; then
    echo "✓ Service is already installed!"
    systemctl status suros-internet-monitor
    exit 0
fi

# Check if script exists
if [[ ! -f /root/suros-internet-monitor.sh ]]; then
    echo "❌ Error: /root/suros-internet-monitor.sh not found!"
    exit 1
fi

# Ensure script is executable
chmod +x /root/suros-internet-monitor.sh

# Create systemd service file
sudo tee /etc/systemd/system/suros-internet-monitor.service > /dev/null << 'EOF'
[Unit]
Description=Suros Host Internet Outage Monitor
After=network.target
StartLimitBurst=5
StartLimitIntervalSec=60s

[Service]
Type=simple
ExecStart=/root/suros-internet-monitor.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=suros-monitor

[Install]
WantedBy=multi-user.target
EOF

echo "✓ Created systemd service file"

# Reload systemd
sudo systemctl daemon-reload
echo "✓ Reloaded systemd daemon"

# Enable service
sudo systemctl enable suros-internet-monitor
echo "✓ Enabled suros-internet-monitor"

# Start service
sudo systemctl start suros-internet-monitor
echo "✓ Started suros-internet-monitor"

# Check status
echo ""
echo "📋 Service Status:"
sudo systemctl status suros-internet-monitor

echo ""
echo "✅ Setup complete!"
echo ""
echo "To check logs: sudo journalctl -u suros-internet-monitor -f"
echo "To stop: sudo systemctl stop suros-internet-monitor"
echo "To restart: sudo systemctl restart suros-internet-monitor"
