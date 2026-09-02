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
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    if [ ! -f "$SCRIPT_DIR/docker-compose.yml" ]; then
        print_error "docker-compose.yml not found in $SCRIPT_DIR"
        exit 1
    fi
    print_status "Suros directory found at $SCRIPT_DIR"
    
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
    
    print_info "Configuring internet monitor script..."
    
    MONITOR_SCRIPT="$SCRIPT_DIR/suros-internet-monitor.sh"
    chmod +x "$MONITOR_SCRIPT"
    print_status "Internet monitor script configured"
    
    print_info "Creating systemd service..."
    
    # Create systemd service file
    cat > /etc/systemd/system/suros-internet-monitor.service << EOF
[Unit]
Description=Suros Internet Monitoring Service
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$SCRIPT_DIR
ExecStart=$MONITOR_SCRIPT
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
    
    cd "$SCRIPT_DIR"
    
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
    
    print_info "Waiting for services to start (15-30 seconds)..."
    sleep 15
    
    # Verify services
    printf "\n${WHITE}Verification${NC}\n"
    if docker compose ps | grep -qi "backend.*running\|backend.*up"; then
        print_status "Backend is running"
    else
        print_error "Backend failed to start"
    fi
    
    if docker compose ps | grep -qi "frontend.*running\|frontend.*up"; then
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
    printf "  View outages:  tail -f $SCRIPT_DIR/backend/logs/suros-outages.log\n"
    printf "  Check status:  systemctl status suros-internet-monitor\n"
    printf "  Stop service:  sudo systemctl stop suros-internet-monitor\n"
    printf "  Restart all:   cd $SCRIPT_DIR && docker compose restart\n\n"
}

# Run main function
main "$@"
