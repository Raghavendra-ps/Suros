#!/bin/bash

# Suros Complete Setup Script
# Sets up systemd monitoring, configures ports, and deploys Docker containers

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
WHITE='\033[1;37m'
NC='\033[0m'
BOLD='\033[1m'

# Status functions
print_status() {
    printf "${GREEN}[✓]${NC} $1\n"
}

print_error() {
    printf "${RED}[✗]${NC} $1\n"
}

print_info() {
    printf "${RED}[i]${NC} $1\n"
}

read_port() {
    local prompt="$1"
    local default="$2"
    local input
    
    while true; do
        read -p "$(printf "${RED}?${NC} ${BOLD}$prompt${RESET} (default: ${RED}$default${NC}): ")" input
        input=${input:-$default}
        
        if [[ $input =~ ^[0-9]+$ ]] && [ "$input" -ge 1024 ] && [ "$input" -le 65535 ]; then
            echo "$input"
            return 0
        else
            print_error "Invalid port! Must be between 1024 and 65535."
        fi
    done
}

# Main script
main() {
    clear
    printf "${RED}%s${NC}\n" "
                                                           
                                                                      
                                                                      
                                                                      
                           ███████            █████████               
                            ██████         ████████████               
                              ████        █████████████               
                                ██      ███████████████               
                 █████████████████     ████████████████               
                 █████████████████    █████████████████               
                 █████████████████   ██████████████████               
                 ████████████████    ██████████████████               
                 ███████████████     ██                               
                 █████████████       ████                             
                 ███████████         ██████                           
                 ████████            ███████                          
                 ████                ████████                         
"
    printf "\n${RED}${BOLD}SUROS - UPTIME MONITOR SETUP${NC}\n"
    printf "${WHITE}Complete automated installation${NC}\n\n"
    
    printf "${WHITE}Setup includes:${NC}\n"
    printf "  ${RED}1.${NC} Systemd internet monitoring service\n"
    printf "  ${RED}2.${NC} Port configuration\n"
    printf "  ${RED}3.${NC} Docker container deployment\n"
    printf "  ${RED}4.${NC} Service verification\n\n"
    
    # Prerequisites check
    printf "${WHITE}Checking prerequisites...${NC}\n"
    
    if [ "$EUID" -ne 0 ]; then
        print_error "Must run as root (use: sudo bash setup-suros.sh)"
        exit 1
    fi
    print_status "Running as root"
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_status "Docker is installed"
    
    if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not available"
        exit 1
    fi
    print_status "Docker Compose is available"
    
    if [ ! -d "/root/Suros" ]; then
        print_error "Suros directory not found at /root/Suros"
        exit 1
    fi
    print_status "Suros directory found"
    
    if ! command -v systemctl &> /dev/null; then
        print_error "Systemd is not available"
        exit 1
    fi
    print_status "Systemd is available"
    
    # Port configuration
    printf "\n${WHITE}Port Configuration${NC}\n"
    print_info "Ports must be between 1024-65535 and not in use"
    
    BACKEND_PORT=$(read_port "Backend API port" "7689")
    FRONTEND_PORT=$(read_port "Frontend web port" "8755")
    
    print_status "Backend: port $BACKEND_PORT"
    print_status "Frontend: port $FRONTEND_PORT"
    
    # Systemd service setup
    printf "\n${WHITE}Setting up Systemd Service${NC}\n"
    
    print_info "Creating internet monitor script..."
    
    # Create the internet monitor script
    cat > /root/suros-internet-monitor.sh << 'EOF'
#!/bin/bash

OUTAGE_LOG_FILE="${OUTAGE_LOG_FILE:-/root/suros-outages.log}"
CHECK_INTERVAL=10
CONFIRM_THRESHOLD=3

up_streak=0
down_streak=0
last_state="online"

log_event() {
    local event_type=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$timestamp | $event_type | $message" >> "$OUTAGE_LOG_FILE"
}

is_internet_reachable() {
    if timeout 3 bash -c "echo > /dev/tcp/1.1.1.1/53" 2>/dev/null; then
        return 0
    fi
    if timeout 3 bash -c "echo > /dev/tcp/8.8.8.8/53" 2>/dev/null; then
        return 0
    fi
    return 1
}

while true; do
    if is_internet_reachable; then
        up_streak=$((up_streak + 1))
        down_streak=0
        if [ $up_streak -eq $CONFIRM_THRESHOLD ] && [ "$last_state" = "offline" ]; then
            log_event "RECOVERY" "Internet connectivity restored"
            last_state="online"
        fi
    else
        down_streak=$((down_streak + 1))
        up_streak=0
        if [ $down_streak -eq $CONFIRM_THRESHOLD ] && [ "$last_state" != "offline" ]; then
            log_event "OUTAGE" "Internet connectivity lost"
            last_state="offline"
        fi
    fi
    sleep $CHECK_INTERVAL
done
EOF
    chmod +x /root/suros-internet-monitor.sh
    print_status "Internet monitor script created"
    
    print_info "Creating systemd service..."
    
    # Create systemd service file
    cat > /etc/systemd/system/suros-internet-monitor.service << 'EOF'
[Unit]
Description=Suros Internet Monitoring Service
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=/root/suros-internet-monitor.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    print_status "Systemd service created"
    
    print_info "Starting service..."
    systemctl enable suros-internet-monitor.service 2>/dev/null
    systemctl start suros-internet-monitor.service
    sleep 2
    
    if systemctl is-active --quiet suros-internet-monitor.service; then
        print_status "Service is running"
    else
        print_error "Failed to start service"
        systemctl status suros-internet-monitor.service
        exit 1
    fi
    
    # Docker Compose deployment
    printf "\n${WHITE}Docker Compose Deployment${NC}\n"
    
    print_info "Updating configuration..."
    
    # Update docker-compose.yml with custom ports
    cd /root/Suros
    
    # Backup original
    if [ ! -f docker-compose.yml.bak ]; then
        cp docker-compose.yml docker-compose.yml.bak
        print_status "Configuration backed up"
    fi
    
    # Update backend port
    sed -i "s/- \"[0-9]*:8000\"/- \"$BACKEND_PORT:8000\"/g" docker-compose.yml
    
    # Update frontend port
    sed -i "s/- \"[0-9]*:80\"/- \"$FRONTEND_PORT:80\"/g" docker-compose.yml
    
    print_status "Port mappings updated"
    
    print_info "Building and starting containers..."
    docker compose down --remove-orphans 2>/dev/null || true
    
    if docker compose up -d --build; then
        print_status "Containers deployed"
    else
        print_error "Failed to deploy containers"
        exit 1
    fi
    
    print_info "Waiting for services to start (30-60 seconds)..."
    sleep 30
    
    # Verify services
    printf "\n${WHITE}Verification${NC}\n"
    if docker compose ps | grep -q "suros-backend.*Up"; then
        print_status "Backend is running"
    else
        print_error "Backend failed to start"
    fi
    
    if docker compose ps | grep -q "suros-frontend.*Up"; then
        print_status "Frontend is running"
    else
        print_error "Frontend failed to start"
    fi
    
    # Summary
    printf "\n${BOLD}${GREEN}✓ Setup Complete!${NC}\n\n"
    printf "${WHITE}Access your Suros instance:${NC}\n"
    printf "  Frontend:  http://localhost:${RED}$FRONTEND_PORT${NC}\n"
    printf "  API:       http://localhost:${RED}$BACKEND_PORT${NC}\n\n"
    
    printf "${WHITE}Useful commands:${NC}\n"
    printf "  View logs:     journalctl -u suros-internet-monitor -f\n"
    printf "  View outages:  tail -f /root/suros-outages.log\n"
    printf "  Check status:  systemctl status suros-internet-monitor\n"
    printf "  Stop service:  sudo systemctl stop suros-internet-monitor\n"
    printf "  Restart all:   cd /root/Suros && docker compose restart\n\n"
}

# Run main function
main "$@"
